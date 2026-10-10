import { ConflictException, ForbiddenException } from '@nestjs/common';
import { RatingDirection, RatingStatus, RideStatus } from '@prisma/client';
import { RatingService } from './rating.service';

const rideId = '00000000-0000-0000-0000-000000000001';
const customerId = '00000000-0000-0000-0000-000000000002';
const driverId = '00000000-0000-0000-0000-000000000003';

function completedRide(): { id: string; status: RideStatus; requestedByCustomer: { userId: string }; driver: { userId: string }; participants: never[] } {
  return { id: rideId, status: RideStatus.COMPLETED, requestedByCustomer: { userId: customerId }, driver: { userId: driverId }, participants: [] };
}

function transactionMock(ride = completedRide(), existing: unknown = null) {
  return {
    $queryRaw: jest.fn(),
    ride: { findUnique: jest.fn().mockResolvedValue(ride) },
    rating: { findUnique: jest.fn().mockResolvedValue(existing), create: jest.fn().mockResolvedValue({ id: 'rating', direction: RatingDirection.CUSTOMER_TO_DRIVER, score: 5 }), update: jest.fn() },
    auditLog: { create: jest.fn() },
  };
}

describe('RatingService', () => {
  it('allows a customer to rate the assigned driver only after completion', async () => {
    const tx = transactionMock();
    const prisma = { $transaction: jest.fn((callback: (transaction: typeof tx) => unknown) => callback(tx)) };
    const service = new RatingService(prisma as never);

    const result = await service.createRating(rideId, customerId, { ratedUserId: driverId, score: 5, reviewText: 'Great ride' });

    expect(result.direction).toBe(RatingDirection.CUSTOMER_TO_DRIVER);
    expect(tx.rating.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ rideId, raterUserId: customerId, ratedUserId: driverId, score: 5 }) }));
  });

  it('allows the assigned driver to rate a customer', async () => {
    const tx = transactionMock();
    tx.rating.create.mockResolvedValue({ id: 'rating', direction: RatingDirection.DRIVER_TO_CUSTOMER });
    const prisma = { $transaction: jest.fn((callback: (transaction: typeof tx) => unknown) => callback(tx)) };
    const service = new RatingService(prisma as never);

    const result = await service.createRating(rideId, driverId, { ratedUserId: customerId, score: 4 });

    expect(result.direction).toBe(RatingDirection.DRIVER_TO_CUSTOMER);
  });

  it('rejects ratings for incomplete rides and unauthorized relationships', async () => {
    const incomplete = transactionMock({ ...completedRide(), status: RideStatus.IN_PROGRESS });
    const unauthorized = transactionMock();
    const prisma = { $transaction: jest.fn((callback: (transaction: typeof incomplete) => unknown) => callback(incomplete)) };
    const service = new RatingService(prisma as never);

    await expect(service.createRating(rideId, customerId, { ratedUserId: driverId, score: 5 })).rejects.toThrow('Only completed rides');
    const secondPrisma = { $transaction: jest.fn((callback: (transaction: typeof unauthorized) => unknown) => callback(unauthorized)) };
    const secondService = new RatingService(secondPrisma as never);
    await expect(secondService.createRating(rideId, '00000000-0000-0000-0000-000000000004', { ratedUserId: driverId, score: 5 })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('prevents duplicate ratings for one ride relationship', async () => {
    const tx = transactionMock(completedRide(), { id: 'existing' });
    const prisma = { $transaction: jest.fn((callback: (transaction: typeof tx) => unknown) => callback(tx)) };
    const service = new RatingService(prisma as never);

    await expect(service.createRating(rideId, customerId, { ratedUserId: driverId, score: 5 })).rejects.toBeInstanceOf(ConflictException);
    expect(tx.rating.create).not.toHaveBeenCalled();
  });

  it('aggregates only published ratings', async () => {
    const prisma = { rating: { aggregate: jest.fn().mockResolvedValue({ _avg: { score: 4.5 }, _count: { _all: 2 } }) } };
    const service = new RatingService(prisma as never);

    await expect(service.getSummary(driverId)).resolves.toEqual({ userId: driverId, averageScore: 4.5, totalRatings: 2 });
    expect(prisma.rating.aggregate).toHaveBeenCalledWith(expect.objectContaining({ where: { ratedUserId: driverId, status: RatingStatus.PUBLISHED } }));
  });

  it('creates one abuse report and marks the rating reported', async () => {
    const tx = { ratingReport: { create: jest.fn().mockResolvedValue({ id: 'report' }) }, rating: { update: jest.fn() }, auditLog: { create: jest.fn() } };
    const prisma = { rating: { findUnique: jest.fn().mockResolvedValue({ id: 'rating', raterUserId: customerId }) }, $transaction: jest.fn((callback: (transaction: typeof tx) => unknown) => callback(tx)) };
    const service = new RatingService(prisma as never);

    await service.reportRating('rating', driverId, { reason: 'Inappropriate review' });

    expect(tx.rating.update).toHaveBeenCalledWith(expect.objectContaining({ data: { status: RatingStatus.REPORTED } }));
  });
});
