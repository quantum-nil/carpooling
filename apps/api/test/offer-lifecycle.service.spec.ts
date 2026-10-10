import { ConflictException, ForbiddenException } from '@nestjs/common';
import { RideOfferStatus, RideStatus } from '@prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import { MatchingService } from '../src/matching/matching.service';
import { OfferLifecycleService } from '../src/matching/offer-lifecycle.service';

describe('OfferLifecycleService', () => {
  const prisma = {
    rideOffer: { findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
    ride: { findUnique: jest.fn(), update: jest.fn() },
    auditLog: { create: jest.fn() },
    $queryRaw: jest.fn(),
    $transaction: jest.fn(),
  } as unknown as PrismaService;
  const matching = { matchRide: jest.fn().mockResolvedValue({ matched: true }) } as unknown as MatchingService;
  const service = new OfferLifecycleService(prisma, matching);

  const offer = {
    id: 'offer-id',
    rideId: 'ride-id',
    driverId: 'driver-id',
    vehicleId: 'vehicle-id',
    score: 1,
    distanceMeters: 1000,
    etaSeconds: 100,
    routeDistanceMeters: 1200,
    status: RideOfferStatus.PENDING,
    expiresAt: new Date(Date.now() + 60_000),
    respondedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    driver: { id: 'driver-id', userId: 'driver-user-id', employeeCode: 'EMP-1' },
    vehicle: { id: 'vehicle-id', registrationNumber: 'KA01', capacity: 4 },
    ride: { id: 'ride-id', status: RideStatus.OFFERED, driverId: 'driver-id', vehicleId: 'vehicle-id', scheduledAt: new Date() },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.$transaction as jest.Mock).mockImplementation(async (callback: (transaction: typeof prisma) => unknown) => callback(prisma));
    (prisma.$queryRaw as jest.Mock).mockResolvedValue([{ id: 'locked' }]);
    (prisma.rideOffer.findUnique as jest.Mock).mockResolvedValue(offer);
    (prisma.ride.findUnique as jest.Mock).mockResolvedValue(offer.ride);
    (prisma.rideOffer.update as jest.Mock).mockImplementation(async ({ data }: { data: object }) => ({ ...offer, ...data }));
    (prisma.rideOffer.updateMany as jest.Mock).mockResolvedValue({ count: 0 });
    (prisma.ride.update as jest.Mock).mockResolvedValue({});
    (prisma.auditLog.create as jest.Mock).mockResolvedValue({});
  });

  it('accepts an offer and transitions the ride atomically', async () => {
    const result = await service.acceptOffer('offer-id', 'driver-user-id');

    expect(result).toMatchObject({ id: 'offer-id', status: RideOfferStatus.ACCEPTED });
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(2);
    expect(prisma.ride.update).toHaveBeenCalledWith({ where: { id: 'ride-id' }, data: { status: RideStatus.ACCEPTED } });
  });

  it('makes repeated acceptance idempotent', async () => {
    (prisma.rideOffer.findUnique as jest.Mock).mockResolvedValue({ ...offer, status: RideOfferStatus.ACCEPTED });

    await expect(service.acceptOffer('offer-id', 'driver-user-id')).resolves.toMatchObject({ status: RideOfferStatus.ACCEPTED });
    expect(prisma.ride.update).not.toHaveBeenCalled();
  });

  it('rejects an offer and requests the next candidate', async () => {
    const result = await service.rejectOffer('offer-id', 'driver-user-id');

    expect(result).toMatchObject({ status: RideOfferStatus.REJECTED });
    expect(prisma.ride.update).toHaveBeenCalledWith({ where: { id: 'ride-id' }, data: { status: RideStatus.MATCHING, driverId: null, vehicleId: null } });
    expect(matching.matchRide).toHaveBeenCalledWith('ride-id');
  });

  it('makes repeated rejection idempotent without rematching', async () => {
    (prisma.rideOffer.findUnique as jest.Mock).mockResolvedValue({ ...offer, status: RideOfferStatus.REJECTED });

    await expect(service.rejectOffer('offer-id', 'driver-user-id')).resolves.toMatchObject({ status: RideOfferStatus.REJECTED });
    expect(matching.matchRide).not.toHaveBeenCalled();
  });

  it('expires pending offers and rematches', async () => {
    await expect(service.expireOffer('offer-id')).resolves.toMatchObject({ matched: true });
    expect(prisma.rideOffer.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: RideOfferStatus.EXPIRED }) }));
    expect(matching.matchRide).toHaveBeenCalledWith('ride-id');
  });

  it('rejects actions from another driver and conflicting actions', async () => {
    await expect(service.acceptOffer('offer-id', 'other-driver')).rejects.toBeInstanceOf(ForbiddenException);
    (prisma.rideOffer.findUnique as jest.Mock).mockResolvedValue({ ...offer, status: RideOfferStatus.EXPIRED });
    await expect(service.acceptOffer('offer-id', 'driver-user-id')).rejects.toBeInstanceOf(ConflictException);
  });
});
