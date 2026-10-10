import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, RideOfferStatus, RideStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MatchingService } from './matching.service';

const offerInclude = {
  ride: { select: { id: true, status: true, driverId: true, vehicleId: true, scheduledAt: true } },
  driver: { select: { id: true, userId: true, employeeCode: true } },
  vehicle: { select: { id: true, registrationNumber: true, capacity: true } },
} satisfies Prisma.RideOfferInclude;

type OfferWithDetails = Prisma.RideOfferGetPayload<{ include: typeof offerInclude }>;

@Injectable()
export class OfferLifecycleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly matching: MatchingService,
  ) {}

  async getOffer(offerId: string, driverUserId: string) {
    const offer = await this.findOffer(offerId);
    this.assertOwner(offer, driverUserId);
    return this.toOffer(offer);
  }

  async listOffers(driverUserId: string) {
    const driver = await this.prisma.employee.findUnique({ where: { userId: driverUserId } });
    if (!driver) throw new NotFoundException('Driver profile not found');
    const offers = await this.prisma.rideOffer.findMany({
      where: { driverId: driver.id, status: { in: [RideOfferStatus.PENDING, RideOfferStatus.ACCEPTED] } },
      include: offerInclude,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return offers.map((offer) => this.toOffer(offer));
  }

  async acceptOffer(offerId: string, driverUserId: string) {
    const result = await this.prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT "id" FROM "RideOffer" WHERE "id" = ${offerId} FOR UPDATE`;
      const offer = await transaction.rideOffer.findUnique({ where: { id: offerId }, include: offerInclude });
      if (!offer) throw new NotFoundException('Driver offer not found');
      this.assertOwner(offer, driverUserId);
      if (offer.status === RideOfferStatus.ACCEPTED) return { offer, reassigned: false };
      if (offer.status !== RideOfferStatus.PENDING) throw new ConflictException('Offer is no longer actionable');
      if (offer.expiresAt <= new Date()) {
        await transaction.rideOffer.update({ where: { id: offerId }, data: { status: RideOfferStatus.EXPIRED, respondedAt: new Date() } });
        return { offer: null, reassigned: true, rideId: offer.ride.id };
      }
      await transaction.$queryRaw`SELECT "id" FROM "Ride" WHERE "id" = ${offer.ride.id} FOR UPDATE`;
      const ride = await transaction.ride.findUnique({ where: { id: offer.ride.id } });
      if (!ride || ride.status !== RideStatus.OFFERED || ride.driverId !== offer.driverId || ride.vehicleId !== offer.vehicleId) throw new ConflictException('Ride is no longer available for this offer');
      const updated = await transaction.rideOffer.update({ where: { id: offerId }, data: { status: RideOfferStatus.ACCEPTED, respondedAt: new Date() }, include: offerInclude });
      await transaction.rideOffer.updateMany({ where: { rideId: offer.ride.id, id: { not: offerId }, status: RideOfferStatus.PENDING }, data: { status: RideOfferStatus.EXPIRED, respondedAt: new Date() } });
      await transaction.ride.update({ where: { id: offer.ride.id }, data: { status: RideStatus.ACCEPTED } });
      await transaction.auditLog.create({ data: { actorUserId: driverUserId, entityType: 'RideOffer', entityId: offerId, action: 'DRIVER_OFFER_ACCEPTED' } });
      return { offer: updated, reassigned: false };
    });
    if (result.reassigned && result.rideId) return this.expireAndRematch(result.rideId);
    return result.offer ? this.toOffer(result.offer) : null;
  }

  async rejectOffer(offerId: string, driverUserId: string) {
    const result = await this.prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT "id" FROM "RideOffer" WHERE "id" = ${offerId} FOR UPDATE`;
      const offer = await transaction.rideOffer.findUnique({ where: { id: offerId }, include: offerInclude });
      if (!offer) throw new NotFoundException('Driver offer not found');
      this.assertOwner(offer, driverUserId);
      if (offer.status === RideOfferStatus.REJECTED) return { offer, reassigned: false };
      if (offer.status !== RideOfferStatus.PENDING) throw new ConflictException('Offer is no longer actionable');
      if (offer.expiresAt <= new Date()) {
        await transaction.$queryRaw`SELECT "id" FROM "Ride" WHERE "id" = ${offer.ride.id} FOR UPDATE`;
        const expired = await transaction.rideOffer.update({ where: { id: offerId }, data: { status: RideOfferStatus.EXPIRED, respondedAt: new Date() }, include: offerInclude });
        const ride = await transaction.ride.findUnique({ where: { id: offer.ride.id } });
        if (ride?.status === RideStatus.OFFERED && ride.driverId === offer.driverId) await transaction.ride.update({ where: { id: offer.ride.id }, data: { status: RideStatus.MATCHING, driverId: null, vehicleId: null } });
        await transaction.auditLog.create({ data: { actorUserId: null, entityType: 'RideOffer', entityId: offerId, action: 'DRIVER_OFFER_EXPIRED' } });
        return { offer: expired, reassigned: true, rideId: offer.ride.id };
      }
      await transaction.$queryRaw`SELECT "id" FROM "Ride" WHERE "id" = ${offer.ride.id} FOR UPDATE`;
      const updated = await transaction.rideOffer.update({ where: { id: offerId }, data: { status: RideOfferStatus.REJECTED, respondedAt: new Date() }, include: offerInclude });
      const ride = await transaction.ride.findUnique({ where: { id: offer.ride.id } });
      if (ride?.status === RideStatus.OFFERED && ride.driverId === offer.driverId) {
        await transaction.ride.update({ where: { id: offer.ride.id }, data: { status: RideStatus.MATCHING, driverId: null, vehicleId: null } });
      }
      await transaction.auditLog.create({ data: { actorUserId: driverUserId, entityType: 'RideOffer', entityId: offerId, action: 'DRIVER_OFFER_REJECTED' } });
      return { offer: updated, reassigned: true, rideId: offer.ride.id };
    });
    if (result.reassigned && result.rideId) {
      const rematch = await this.rematch(result.rideId);
      return { ...this.toOffer(result.offer), rematch };
    }
    return this.toOffer(result.offer);
  }

  async expireOffer(offerId: string) {
    const result = await this.prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT "id" FROM "RideOffer" WHERE "id" = ${offerId} FOR UPDATE`;
      const offer = await transaction.rideOffer.findUnique({ where: { id: offerId }, include: offerInclude });
      if (!offer || offer.status !== RideOfferStatus.PENDING) return null;
      await transaction.$queryRaw`SELECT "id" FROM "Ride" WHERE "id" = ${offer.ride.id} FOR UPDATE`;
      const updated = await transaction.rideOffer.update({ where: { id: offerId }, data: { status: RideOfferStatus.EXPIRED, respondedAt: new Date() }, include: offerInclude });
      const ride = await transaction.ride.findUnique({ where: { id: offer.ride.id } });
      if (ride?.status === RideStatus.OFFERED && ride.driverId === offer.driverId) await transaction.ride.update({ where: { id: offer.ride.id }, data: { status: RideStatus.MATCHING, driverId: null, vehicleId: null } });
      await transaction.auditLog.create({ data: { actorUserId: null, entityType: 'RideOffer', entityId: offerId, action: 'DRIVER_OFFER_EXPIRED' } });
      return { offer: updated, rideId: offer.ride.id };
    });
    if (!result) return null;
    return this.rematch(result.rideId);
  }

  private async rematch(rideId: string) {
    return this.matching.matchRide(rideId);
  }

  private async expireAndRematch(rideId: string) {
    return this.matching.matchRide(rideId);
  }

  private async findOffer(offerId: string): Promise<OfferWithDetails> {
    const offer = await this.prisma.rideOffer.findUnique({ where: { id: offerId }, include: offerInclude });
    if (!offer) throw new NotFoundException('Driver offer not found');
    return offer;
  }

  private assertOwner(offer: { driver: { userId: string } }, driverUserId: string) {
    if (offer.driver.userId !== driverUserId) throw new ForbiddenException('You are not permitted to act on this offer');
  }

  private toOffer(offer: OfferWithDetails) {
    return {
      id: offer.id,
      rideId: offer.rideId,
      driver: offer.driver,
      vehicle: offer.vehicle,
      score: offer.score,
      distanceMeters: offer.distanceMeters,
      etaSeconds: offer.etaSeconds,
      routeDistanceMeters: offer.routeDistanceMeters,
      status: offer.status,
      expiresAt: offer.expiresAt,
      respondedAt: offer.respondedAt,
      createdAt: offer.createdAt,
      updatedAt: offer.updatedAt,
    };
  }
}
