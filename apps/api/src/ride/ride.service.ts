import { BadRequestException, ForbiddenException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { CustomerStatus, DriverStatus, EmployeeStatus, Prisma, RideRequestStatus, RideStatus, RoleCode, VehicleStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import type { RideAssignmentInput, RideCreateInput, RideTransitionInput } from './ride.schemas';
import { RealtimeEventService } from '../realtime/realtime-event.service';

export const RIDE_TRANSITIONS: Record<RideStatus, readonly RideStatus[]> = {
  [RideStatus.REQUESTED]: [RideStatus.MATCHING, RideStatus.CANCELLED, RideStatus.EXPIRED],
  [RideStatus.MATCHING]: [RideStatus.OFFERED, RideStatus.CANCELLED, RideStatus.EXPIRED],
  [RideStatus.OFFERED]: [RideStatus.ACCEPTED, RideStatus.CANCELLED, RideStatus.EXPIRED],
  [RideStatus.ACCEPTED]: [RideStatus.DRIVER_ARRIVING, RideStatus.CANCELLED],
  [RideStatus.DRIVER_ARRIVING]: [RideStatus.IN_PROGRESS, RideStatus.CANCELLED],
  [RideStatus.IN_PROGRESS]: [RideStatus.COMPLETED],
  [RideStatus.COMPLETED]: [],
  [RideStatus.CANCELLED]: [],
  [RideStatus.EXPIRED]: [],
};

const rideInclude = {
  requestedByCustomer: { select: { id: true, userId: true } },
  driver: { select: { id: true, userId: true, employeeCode: true } },
  vehicle: { select: { id: true, registrationNumber: true, capacity: true } },
  requests: true,
  participants: true,
} satisfies Prisma.RideInclude;

type RideWithDetails = Prisma.RideGetPayload<{ include: typeof rideInclude }>;

@Injectable()
export class RideService {
  constructor(private readonly prisma: PrismaService, @Optional() private readonly realtime?: RealtimeEventService) {}

  async createRide(customerUserId: string, input: RideCreateInput, recurringRideId?: string) {
    const customer = await this.prisma.customer.findUnique({ where: { userId: customerUserId } });
    if (!customer || customer.deletedAt || customer.status !== CustomerStatus.ACTIVE) throw new ForbiddenException('Active customer access required');
    const idempotencyKey = input.idempotencyKey ?? randomUUID();
    let ride: RideWithDetails;
    try {
      ride = await this.prisma.$transaction(async (transaction) => {
        if (input.idempotencyKey) {
          const existing = await transaction.rideRequest.findUnique({
            where: { customerId_idempotencyKey: { customerId: customer.id, idempotencyKey } },
            include: { ride: { include: rideInclude } },
          });
          if (existing) return existing.ride;
        }
        const created = await transaction.ride.create({
        data: {
          requestedByCustomerId: customer.id,
          pickupAddress: input.pickupAddress,
          pickupLatitude: new Prisma.Decimal(input.pickupLatitude),
          pickupLongitude: new Prisma.Decimal(input.pickupLongitude),
          pickupPlaceId: input.pickupPlaceId,
          destinationAddress: input.destinationAddress,
          destinationLatitude: new Prisma.Decimal(input.destinationLatitude),
          destinationLongitude: new Prisma.Decimal(input.destinationLongitude),
          destinationPlaceId: input.destinationPlaceId,
          scheduledAt: input.scheduledAt,
          seatCapacity: input.seatsRequested,
          estimatedFare: input.estimatedFare === null || input.estimatedFare === undefined ? undefined : new Prisma.Decimal(input.estimatedFare),
          currency: input.currency,
          recurringRideId,
          requests: { create: { customerId: customer.id, idempotencyKey, seatsRequested: input.seatsRequested } },
        },
        include: rideInclude,
      });
      await transaction.auditLog.create({ data: { actorUserId: customerUserId, entityType: 'Ride', entityId: created.id, action: 'RIDE_REQUESTED' } });
      return created;
      });
    } catch (error) {
      if (!input.idempotencyKey || !this.isUniqueViolation(error)) throw error;
      const existing = await this.prisma.rideRequest.findUnique({
        where: { customerId_idempotencyKey: { customerId: customer.id, idempotencyKey } },
        include: { ride: { include: rideInclude } },
      });
      if (!existing) throw error;
      ride = existing.ride;
    }
    const publicRide = this.toRide(ride);
    this.realtime?.publishRideRequested(ride.id, customerUserId, publicRide);
    return publicRide;
  }

  async getRide(rideId: string, actorUserId: string) {
    const ride = await this.findRide(rideId);
    await this.assertCanView(ride, actorUserId);
    return this.toRide(ride);
  }

  async getRideRequest(requestId: string, customerUserId: string) {
    const request = await this.prisma.rideRequest.findUnique({
      where: { id: requestId },
      include: { customer: { select: { userId: true } }, ride: { include: rideInclude } },
    });
    if (!request || request.customer.userId !== customerUserId) throw new ForbiddenException('You are not permitted to view this ride request');
    return this.toRequest(request);
  }

  async cancelRideRequest(requestId: string, customerUserId: string, reason: string) {
    const result = await this.prisma.$transaction(async (transaction) => {
      const request = await transaction.rideRequest.findUnique({
        where: { id: requestId },
        include: { customer: { select: { userId: true } }, ride: { include: { participants: true } } },
      });
      if (!request || request.customer.userId !== customerUserId) throw new ForbiddenException('You are not permitted to cancel this ride request');
      if (request.status !== RideRequestStatus.PENDING) throw new BadRequestException('Ride request cannot be cancelled in its current state');
      if (!([RideStatus.REQUESTED, RideStatus.MATCHING, RideStatus.OFFERED] as RideStatus[]).includes(request.ride.status)) {
        throw new BadRequestException('Ride request cannot be cancelled after acceptance');
      }
      const now = new Date();
      await transaction.rideRequest.update({ where: { id: requestId }, data: { status: RideRequestStatus.CANCELLED, respondedAt: now } });
      await transaction.auditLog.create({ data: { actorUserId: customerUserId, entityType: 'RideRequest', entityId: requestId, action: 'RIDE_REQUEST_CANCELLED', metadata: { reason } } });
      const ride = request.ride.participants.length === 0
        ? await transaction.ride.update({
            where: { id: request.rideId },
            data: { status: RideStatus.CANCELLED, cancelledAt: now, cancelledByUserId: customerUserId, cancellationReason: reason },
            include: rideInclude,
          })
        : await transaction.ride.findUniqueOrThrow({ where: { id: request.rideId }, include: rideInclude });
      await transaction.auditLog.create({ data: { actorUserId: customerUserId, entityType: 'Ride', entityId: request.rideId, action: 'RIDE_CANCELLED', metadata: { reason } } });
      return { request: await transaction.rideRequest.findUniqueOrThrow({ where: { id: requestId }, include: { customer: { select: { userId: true } }, ride: { include: rideInclude } } }), ride };
    });
    const publicRequest = this.toRequest(result.request);
    this.realtime?.publishRideStatusChanged(result.ride.id, { ride: this.toRide(result.ride), status: result.ride.status });
    return publicRequest;
  }

  async getCurrentRides(customerUserId: string) {
    const customer = await this.findActiveCustomer(customerUserId);
    const rides = await this.prisma.ride.findMany({
      where: { requestedByCustomerId: customer.id, status: { in: [RideStatus.REQUESTED, RideStatus.MATCHING, RideStatus.OFFERED, RideStatus.ACCEPTED, RideStatus.DRIVER_ARRIVING, RideStatus.IN_PROGRESS] } },
      include: rideInclude,
      orderBy: { scheduledAt: 'asc' },
    });
    return rides.map((ride) => this.toRide(ride));
  }

  async getRideHistory(customerUserId: string) {
    const customer = await this.findActiveCustomer(customerUserId);
    const rides = await this.prisma.ride.findMany({
      where: { requestedByCustomerId: customer.id, status: { in: [RideStatus.COMPLETED, RideStatus.CANCELLED, RideStatus.EXPIRED] } },
      include: rideInclude,
      orderBy: { scheduledAt: 'desc' },
    });
    return rides.map((ride) => this.toRide(ride));
  }

  async getDriverCurrentRides(driverUserId: string) {
    const rides = await this.prisma.ride.findMany({
      where: { driver: { userId: driverUserId }, status: { in: [RideStatus.ACCEPTED, RideStatus.DRIVER_ARRIVING, RideStatus.IN_PROGRESS] } },
      include: rideInclude,
      orderBy: { scheduledAt: 'asc' },
    });
    return rides.map((ride) => this.toRide(ride));
  }

  async getDriverRideHistory(driverUserId: string) {
    const rides = await this.prisma.ride.findMany({
      where: { driver: { userId: driverUserId }, status: { in: [RideStatus.COMPLETED, RideStatus.CANCELLED, RideStatus.EXPIRED] } },
      include: rideInclude,
      orderBy: { scheduledAt: 'desc' },
      take: 100,
    });
    return rides.map((ride) => this.toRide(ride));
  }

  async assignDriver(rideId: string, input: RideAssignmentInput, actorUserId: string) {
    const result = await this.prisma.$transaction(async (transaction) => {
      const ride = await transaction.ride.findUnique({ where: { id: rideId } });
      if (!ride || ([RideStatus.COMPLETED, RideStatus.CANCELLED, RideStatus.EXPIRED] as RideStatus[]).includes(ride.status)) throw new BadRequestException('Ride cannot be assigned in its current state');
      const [driver, vehicle] = await Promise.all([
        transaction.employee.findUnique({ where: { id: input.driverId } }),
        transaction.vehicle.findUnique({ where: { id: input.vehicleId } }),
      ]);
      if (!driver || driver.deletedAt || driver.status !== EmployeeStatus.ACTIVE || driver.driverStatus !== DriverStatus.ACTIVE) throw new BadRequestException('Driver is not active');
      if (!vehicle || vehicle.deletedAt || vehicle.status !== VehicleStatus.ACTIVE || vehicle.assignedEmployeeId !== driver.id) throw new BadRequestException('Vehicle is not active and assigned to the driver');
      const updated = await transaction.ride.update({
        where: { id: rideId },
        data: { driverId: driver.id, vehicleId: vehicle.id, seatCapacity: vehicle.capacity, status: ride.status === RideStatus.REQUESTED ? RideStatus.MATCHING : undefined },
        include: rideInclude,
      });
      await transaction.auditLog.create({ data: { actorUserId, entityType: 'Ride', entityId: rideId, action: 'RIDE_DRIVER_ASSIGNED', metadata: { driverId: driver.id, vehicleId: vehicle.id } } });
      return updated;
    });
    const publicRide = this.toRide(result);
    this.realtime?.publishRideStatusChanged(rideId, { ride: publicRide, status: publicRide.status });
    return publicRide;
  }

  async transitionRide(rideId: string, input: RideTransitionInput, actorUserId: string) {
    const result = await this.prisma.$transaction(async (transaction) => {
      const ride = await transaction.ride.findUnique({
        where: { id: rideId },
        include: { requestedByCustomer: { select: { userId: true } }, driver: { select: { userId: true } } },
      });
      if (!ride) throw new NotFoundException('Ride not found');
      const nextStatus = input.status as RideStatus;
      if (!RIDE_TRANSITIONS[ride.status].includes(nextStatus)) throw new BadRequestException(`Invalid ride transition from ${ride.status} to ${nextStatus}`);
      if (nextStatus === RideStatus.CANCELLED && !input.cancellationReason) throw new BadRequestException('Cancellation reason is required');
      await this.assertCanTransition(transaction, ride, nextStatus, actorUserId);
      const updated = await transaction.ride.update({
        where: { id: rideId },
        data: {
          status: nextStatus,
          ...(nextStatus === RideStatus.DRIVER_ARRIVING && !ride.startedAt ? { startedAt: new Date() } : {}),
          ...(nextStatus === RideStatus.IN_PROGRESS && !ride.startedAt ? { startedAt: new Date() } : {}),
          ...(nextStatus === RideStatus.COMPLETED ? { startedAt: ride.startedAt ?? new Date(), completedAt: new Date() } : {}),
          ...(nextStatus === RideStatus.CANCELLED ? { cancelledAt: new Date(), cancelledByUserId: actorUserId, cancellationReason: input.cancellationReason } : {}),
        },
        include: rideInclude,
      });
      await transaction.auditLog.create({ data: { actorUserId, entityType: 'Ride', entityId: rideId, action: `RIDE_${nextStatus}`, metadata: input.cancellationReason ? { reason: input.cancellationReason } : undefined } });
      return updated;
    });
    const publicRide = this.toRide(result);
    this.realtime?.publishRideStatusChanged(rideId, { ride: publicRide, status: publicRide.status });
    return publicRide;
  }

  async acceptRideRequest(rideId: string, requestId: string, actorUserId: string) {
    const result = await this.prisma.$transaction(async (transaction) => {
      const ride = await transaction.ride.findUnique({ where: { id: rideId }, include: { driver: { select: { userId: true } }, participants: true } });
      const request = await transaction.rideRequest.findUnique({ where: { id: requestId } });
      if (!ride || !request || request.rideId !== rideId) throw new NotFoundException('Ride request not found');
      if (ride.status !== RideStatus.OFFERED || request.status !== RideRequestStatus.PENDING) throw new BadRequestException('Ride request cannot be accepted in its current state');
      if (ride.driver?.userId !== actorUserId) throw new ForbiddenException('Only the assigned driver can accept the request');
      const usedSeats = ride.participants.filter((participant) => participant.status === 'CONFIRMED').reduce((sum, participant) => sum + participant.seats, 0);
      if (usedSeats + request.seatsRequested > ride.seatCapacity) throw new BadRequestException('Ride does not have enough seats');
      await transaction.rideRequest.update({ where: { id: requestId }, data: { status: RideRequestStatus.ACCEPTED, respondedAt: new Date() } });
      await transaction.rideParticipant.create({ data: { rideId, customerId: request.customerId, seats: request.seatsRequested } });
      const updated = await transaction.ride.update({ where: { id: rideId }, data: { status: RideStatus.ACCEPTED }, include: rideInclude });
      await transaction.auditLog.create({ data: { actorUserId, entityType: 'Ride', entityId: rideId, action: 'RIDE_REQUEST_ACCEPTED' } });
      return updated;
    });
    return this.toRide(result);
  }

  private async findRide(rideId: string): Promise<RideWithDetails> {
    const ride = await this.prisma.ride.findUnique({ where: { id: rideId }, include: rideInclude });
    if (!ride) throw new NotFoundException('Ride not found');
    return ride;
  }

  private async findActiveCustomer(customerUserId: string) {
    const customer = await this.prisma.customer.findUnique({ where: { userId: customerUserId } });
    if (!customer || customer.deletedAt || customer.status !== CustomerStatus.ACTIVE) throw new ForbiddenException('Active customer access required');
    return customer;
  }

  private toRequest(request: { id: string; rideId: string; customerId: string; seatsRequested: number; status: RideRequestStatus; respondedAt: Date | null; createdAt: Date; updatedAt: Date; ride: RideWithDetails }) {
    return {
      id: request.id,
      rideId: request.rideId,
      customerId: request.customerId,
      seatsRequested: request.seatsRequested,
      status: request.status,
      respondedAt: request.respondedAt,
      ride: this.toRide(request.ride),
      createdAt: request.createdAt,
      updatedAt: request.updatedAt,
    };
  }

  private async assertCanView(ride: RideWithDetails, actorUserId: string) {
    const actor = await this.prisma.user.findUnique({ where: { id: actorUserId }, select: { roles: { select: { role: { select: { code: true } } } } } });
    const roles = actor?.roles.map(({ role }) => role.code) ?? [];
    if (roles.includes(RoleCode.ADMIN) || (roles.includes(RoleCode.CUSTOMER) && ride.requestedByCustomer.userId === actorUserId) || (roles.includes(RoleCode.EMPLOYEE) && ride.driver?.userId === actorUserId)) return;
    throw new ForbiddenException('You are not permitted to view this ride');
  }

  private async assertCanTransition(transaction: Prisma.TransactionClient, ride: { requestedByCustomer: { userId: string }; driver: { userId: string } | null }, nextStatus: RideStatus, actorUserId: string) {
    const actor = await transaction.user.findUnique({ where: { id: actorUserId }, select: { roles: { select: { role: { select: { code: true } } } } } });
    const roles = actor?.roles.map(({ role }) => role.code) ?? [];
    if (roles.includes(RoleCode.ADMIN)) return;
    if (roles.includes(RoleCode.CUSTOMER) && ride.requestedByCustomer.userId === actorUserId && nextStatus === RideStatus.CANCELLED) return;
    if (roles.includes(RoleCode.EMPLOYEE) && ride.driver?.userId === actorUserId && ([RideStatus.DRIVER_ARRIVING, RideStatus.IN_PROGRESS, RideStatus.COMPLETED, RideStatus.CANCELLED] as RideStatus[]).includes(nextStatus)) return;
    throw new ForbiddenException('You are not permitted to transition this ride');
  }

  private toRide(ride: RideWithDetails) {
    return {
      id: ride.id,
      requestedByCustomerId: ride.requestedByCustomerId,
      driver: ride.driver,
      vehicle: ride.vehicle,
      pickup: { address: ride.pickupAddress, latitude: ride.pickupLatitude, longitude: ride.pickupLongitude, placeId: ride.pickupPlaceId },
      destination: { address: ride.destinationAddress, latitude: ride.destinationLatitude, longitude: ride.destinationLongitude, placeId: ride.destinationPlaceId },
      scheduledAt: ride.scheduledAt,
      status: ride.status,
      seatCapacity: ride.seatCapacity,
      estimatedFare: ride.estimatedFare,
      finalFare: ride.finalFare,
      currency: ride.currency,
      cancellation: ride.cancelledAt ? { at: ride.cancelledAt, reason: ride.cancellationReason } : null,
      requests: ride.requests,
      participants: ride.participants,
      createdAt: ride.createdAt,
      updatedAt: ride.updatedAt,
    };
  }

  private isUniqueViolation(error: unknown) {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
  }
}
