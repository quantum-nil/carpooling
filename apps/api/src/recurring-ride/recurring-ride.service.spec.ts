import { Prisma, RecurringRideOccurrenceStatus, RecurringRideStatus, RideStatus } from '@prisma/client';
import { RecurringRideService } from './recurring-ride.service';

const ruleId = '00000000-0000-0000-0000-000000000001';
const customerUserId = '00000000-0000-0000-0000-000000000002';

function rule() {
  return { id: ruleId, customer: { userId: customerUserId }, status: RecurringRideStatus.ACTIVE, pickupAddress: 'A', pickupLatitude: new Prisma.Decimal(1), pickupLongitude: new Prisma.Decimal(2), pickupPlaceId: null, destinationAddress: 'B', destinationLatitude: new Prisma.Decimal(3), destinationLongitude: new Prisma.Decimal(4), destinationPlaceId: null, scheduledTime: '09:00', timeZone: 'UTC', daysOfWeek: [1, 3], startDate: new Date('2026-08-10T00:00:00.000Z'), endDate: new Date('2026-08-20T23:59:59.999Z'), seatsRequested: 1, estimatedFare: null, currency: 'INR' };
}

describe('RecurringRideService', () => {
  it('generates only selected weekdays within the configured date range', async () => {
    const ride = { id: 'ride-1', status: RideStatus.REQUESTED };
    const prisma = {
      recurringRide: { findUnique: jest.fn().mockResolvedValue(rule()), recurringRideOccurrence: undefined },
      recurringRideOccurrence: {
        upsert: jest.fn().mockImplementation(({ create }: { create: { scheduledAt: Date } }) => Promise.resolve({ id: create.scheduledAt.toISOString(), status: RecurringRideOccurrenceStatus.PENDING })),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }), update: jest.fn(),
      },
    };
    const rides = { createRide: jest.fn().mockResolvedValue(ride) };
    const queue = {};
    const config = { getOrThrow: jest.fn().mockReturnValue(30) };
    const service = new RecurringRideService(prisma as never, rides as never, queue as never, config as never);

    const result = await service.generateRule(ruleId, new Date('2026-08-09T00:00:00.000Z'));

    expect(result.generated).toBe(4);
    expect(rides.createRide).toHaveBeenCalledTimes(4);
    expect(rides.createRide.mock.calls.every(([, input]) => [1, 3].includes((input as { scheduledAt: Date }).scheduledAt.getUTCDay()))).toBe(true);
  });

  it('records a failed occurrence for retry instead of losing the schedule', async () => {
    const currentRule = rule();
    const occurrence = { id: 'occurrence', status: RecurringRideOccurrenceStatus.PENDING };
    const prisma = {
      recurringRide: { findUnique: jest.fn().mockResolvedValue(currentRule) },
      recurringRideOccurrence: { upsert: jest.fn().mockResolvedValue(occurrence), updateMany: jest.fn().mockResolvedValue({ count: 1 }), update: jest.fn() },
    };
    const rides = { createRide: jest.fn().mockRejectedValue(new Error('database unavailable')) };
    const service = new RecurringRideService(prisma as never, rides as never, {} as never, { getOrThrow: jest.fn().mockReturnValue(30) } as never);

    const result = await service.generateRule(ruleId, new Date('2026-08-09T00:00:00.000Z'));

    expect(result.failed).toBe(4);
    expect(prisma.recurringRideOccurrence.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: RecurringRideOccurrenceStatus.FAILED }) }));
  });

  it('cancels future pending occurrences and rejects another customer', async () => {
    const tx = {
      recurringRide: { findUnique: jest.fn().mockResolvedValue(rule()), update: jest.fn().mockResolvedValue({ ...rule(), status: RecurringRideStatus.CANCELLED }) },
      recurringRideOccurrence: { updateMany: jest.fn().mockResolvedValue({ count: 2 }) },
      auditLog: { create: jest.fn() },
    };
    const prisma = { $transaction: jest.fn((callback: (transaction: typeof tx) => unknown) => callback(tx)) };
    const service = new RecurringRideService(prisma as never, {} as never, {} as never, { getOrThrow: jest.fn().mockReturnValue(30) } as never);

    await service.cancel(ruleId, customerUserId, { reason: 'Schedule changed' });
    expect(tx.recurringRideOccurrence.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: RecurringRideOccurrenceStatus.CANCELLED }) }));
  });
});
