import { Injectable, NotFoundException, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DriverAvailability, DriverStatus, EmployeeStatus, Prisma, RideStatus, VehicleStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { DriverLocationService } from '../driver-location/driver-location.service';
import { MapsService } from '../maps/maps.service';
import type { AppEnv } from '../config/env';
import { OfferExpirationQueueService } from './offer-expiration-queue.service';
import { RealtimeEventService } from '../realtime/realtime-event.service';

const CONFLICTING_RIDE_STATUSES = [RideStatus.MATCHING, RideStatus.OFFERED, RideStatus.ACCEPTED, RideStatus.DRIVER_ARRIVING, RideStatus.IN_PROGRESS];

export interface MatchCandidate {
  employeeId: string;
  vehicleId: string;
  distanceMeters: number;
  etaSeconds: number;
  routeDistanceMeters: number;
  score: number;
}

@Injectable()
export class MatchingService {
  private readonly maxDistanceKm: number;
  private readonly distanceWeight: number;
  private readonly etaWeight: number;
  private readonly routeWeight: number;
  private readonly offerTtlSeconds: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly locations: DriverLocationService,
    private readonly maps: MapsService,
    private readonly expirationQueue: OfferExpirationQueueService,
    config: ConfigService<AppEnv>,
    @Optional() private readonly realtime?: RealtimeEventService,
  ) {
    this.maxDistanceKm = config.getOrThrow('MATCHING_MAX_DISTANCE_KM');
    this.distanceWeight = config.getOrThrow('MATCHING_DISTANCE_WEIGHT');
    this.etaWeight = config.getOrThrow('MATCHING_ETA_WEIGHT');
    this.routeWeight = config.getOrThrow('MATCHING_ROUTE_WEIGHT');
    this.offerTtlSeconds = config.getOrThrow('MATCHING_OFFER_TTL_SECONDS');
  }

  async matchRide(rideId: string) {
    const ride = await this.prisma.ride.findUnique({ where: { id: rideId }, include: { requests: { where: { status: 'PENDING' }, orderBy: { createdAt: 'asc' }, take: 1 } } });
    if (!ride) throw new NotFoundException('Ride not found');
    if (!([RideStatus.REQUESTED, RideStatus.MATCHING] as RideStatus[]).includes(ride.status)) return { matched: false, reason: 'RIDE_NOT_MATCHABLE' as const, candidatesConsidered: 0 };
    const requiredSeats = ride.requests[0]?.seatsRequested ?? ride.seatCapacity;
    const rejectedOrExpired = await this.prisma.rideOffer.findMany({ where: { rideId, status: { in: ['REJECTED', 'EXPIRED'] } }, select: { driverId: true } });
    const ranked = await this.rankCandidates(ride.pickupLatitude.toNumber(), ride.pickupLongitude.toNumber(), requiredSeats, rejectedOrExpired.map(({ driverId }) => driverId));

    let matchedDriverUserId: string | undefined;
    const result = await this.prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT "id" FROM "Ride" WHERE "id" = ${rideId} FOR UPDATE`;
      const lockedRide = await transaction.ride.findUnique({ where: { id: rideId } });
      if (!lockedRide || !([RideStatus.REQUESTED, RideStatus.MATCHING] as RideStatus[]).includes(lockedRide.status)) {
        return { matched: false, reason: 'RIDE_NOT_MATCHABLE' as const, candidatesConsidered: 0 };
      }

      for (const candidate of ranked) {
        await transaction.$queryRaw`SELECT "id" FROM "Employee" WHERE "id" = ${candidate.employeeId} FOR UPDATE`;
        await transaction.$queryRaw`SELECT "id" FROM "Vehicle" WHERE "id" = ${candidate.vehicleId} FOR UPDATE`;
        const conflict = await transaction.ride.findFirst({
          where: { driverId: candidate.employeeId, id: { not: rideId }, status: { in: CONFLICTING_RIDE_STATUSES } },
          select: { id: true },
        });
        const currentDriver = await transaction.employee.findUnique({
          where: { id: candidate.employeeId },
          select: { userId: true, status: true, driverStatus: true, availability: true, deletedAt: true },
        });
        const currentVehicle = await transaction.vehicle.findUnique({
          where: { id: candidate.vehicleId },
          select: { status: true, capacity: true, assignedEmployeeId: true, deletedAt: true },
        });
        if (conflict || !currentDriver || currentDriver.status !== EmployeeStatus.ACTIVE || currentDriver.driverStatus !== DriverStatus.ACTIVE || currentDriver.availability !== DriverAvailability.AVAILABLE || currentDriver.deletedAt || !currentVehicle || currentVehicle.status !== VehicleStatus.ACTIVE || currentVehicle.deletedAt || currentVehicle.assignedEmployeeId !== candidate.employeeId || currentVehicle.capacity < requiredSeats) continue;

        const expiresAt = new Date(Date.now() + this.offerTtlSeconds * 1000);
        const offer = await transaction.rideOffer.create({
          data: {
            rideId,
            driverId: candidate.employeeId,
            vehicleId: candidate.vehicleId,
            score: new Prisma.Decimal(candidate.score.toFixed(4)),
            distanceMeters: Math.round(candidate.distanceMeters),
            etaSeconds: Math.round(candidate.etaSeconds),
            routeDistanceMeters: Math.round(candidate.routeDistanceMeters),
            expiresAt,
          },
        });
        await transaction.ride.update({ where: { id: rideId }, data: { status: RideStatus.OFFERED, driverId: candidate.employeeId, vehicleId: candidate.vehicleId } });
        await transaction.auditLog.create({ data: { actorUserId: null, entityType: 'Ride', entityId: rideId, action: 'DRIVER_OFFER_CREATED', metadata: { offerId: offer.id, driverId: candidate.employeeId, score: candidate.score } } });
        matchedDriverUserId = currentDriver.userId;
        return { matched: true, offer, candidatesConsidered: ranked.length };
      }

      if (lockedRide.status === RideStatus.REQUESTED) {
        await transaction.ride.update({ where: { id: rideId }, data: { status: RideStatus.MATCHING } });
        await transaction.auditLog.create({ data: { actorUserId: null, entityType: 'Ride', entityId: rideId, action: 'RIDE_MATCHING_STARTED' } });
      }
      return { matched: false, reason: 'NO_ELIGIBLE_DRIVER' as const, candidatesConsidered: ranked.length };
    });
    if (result.matched && result.offer) {
      await this.expirationQueue.schedule(result.offer.id, result.offer.expiresAt);
      if (matchedDriverUserId) this.realtime?.publishDriverOffer(rideId, matchedDriverUserId, result.offer);
    }
    return result;
  }

  async rankCandidates(pickupLatitude: number, pickupLongitude: number, requiredSeats: number, excludedDriverIds: string[] = []): Promise<MatchCandidate[]> {
    const employees = await this.prisma.employee.findMany({
      where: {
        status: EmployeeStatus.ACTIVE,
        driverStatus: DriverStatus.ACTIVE,
        availability: DriverAvailability.AVAILABLE,
        deletedAt: null,
        vehicles: { some: { status: VehicleStatus.ACTIVE, deletedAt: null, capacity: { gte: requiredSeats } } },
      },
      include: { vehicles: { where: { status: VehicleStatus.ACTIVE, deletedAt: null, capacity: { gte: requiredSeats } }, orderBy: { id: 'asc' }, take: 1 } },
      orderBy: { id: 'asc' },
    });
    const candidates = await Promise.all(employees.filter((employee) => !excludedDriverIds.includes(employee.id)).map(async (employee) => {
      const vehicle = employee.vehicles[0];
      if (!vehicle) return null;
      const current = await this.locations.getCurrentLocation(employee.id);
      if (!current || current.stale) return null;
      const straightLineMeters = haversineMeters(current.latitude, current.longitude, pickupLatitude, pickupLongitude);
      if (straightLineMeters > this.maxDistanceKm * 1000) return null;
      try {
        const origin = { latitude: current.latitude, longitude: current.longitude };
        const pickup = { latitude: pickupLatitude, longitude: pickupLongitude };
        const [route, distance, eta] = await Promise.all([
          this.maps.calculateRoute(origin, pickup),
          this.maps.calculateDistance(origin, pickup),
          this.maps.calculateEta(origin, pickup),
        ]);
        return {
          employeeId: employee.id,
          vehicleId: vehicle.id,
          distanceMeters: distance.distanceMeters,
          etaSeconds: eta.durationSeconds,
          routeDistanceMeters: route.distanceMeters,
          score: this.distanceWeight * distance.distanceMeters / 1000 + this.etaWeight * eta.durationSeconds / 60 + this.routeWeight * route.distanceMeters / 1000,
        } satisfies MatchCandidate;
      } catch {
        return null;
      }
    }));
    return candidates.filter((candidate): candidate is MatchCandidate => candidate !== null).sort((a, b) =>
      a.score - b.score || a.distanceMeters - b.distanceMeters || a.etaSeconds - b.etaSeconds || a.employeeId.localeCompare(b.employeeId),
    );
  }
}

export function haversineMeters(latitude1: number, longitude1: number, latitude2: number, longitude2: number) {
  const earthRadiusMeters = 6_371_000;
  const latitudeDelta = ((latitude2 - latitude1) * Math.PI) / 180;
  const longitudeDelta = ((longitude2 - longitude1) * Math.PI) / 180;
  const a = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos((latitude1 * Math.PI) / 180) * Math.cos((latitude2 * Math.PI) / 180) * Math.sin(longitudeDelta / 2) ** 2;
  return earthRadiusMeters * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
