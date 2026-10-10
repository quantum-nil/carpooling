import { AnalyticsService, averageMinutes, percentage } from './analytics.service';

describe('analytics calculations', () => {
  it('calculates averages and safe percentages', () => {
    expect(averageMinutes([60_000, 180_000])).toBe(2);
    expect(averageMinutes([])).toBeNull();
    expect(percentage(2, 4)).toBe(50);
    expect(percentage(1, 0)).toBe(0);
  });

  it('builds operational metrics from persisted records', async () => {
    const prisma = {
      ride: {
        count: jest.fn().mockResolvedValueOnce(10).mockResolvedValueOnce(6).mockResolvedValueOnce(2),
        findMany: jest.fn()
          .mockResolvedValueOnce([{ driverId: 'driver-1' }, { driverId: 'driver-2' }])
          .mockResolvedValueOnce([{ createdAt: new Date('2026-01-01T00:00:00Z'), offers: [{ createdAt: new Date('2026-01-01T00:05:00Z') }] }])
          .mockResolvedValueOnce([{ startedAt: new Date('2026-01-01T01:00:00Z'), completedAt: new Date('2026-01-01T01:45:00Z') }]),
      },
      employee: { count: jest.fn().mockResolvedValue(4) },
      payment: { groupBy: jest.fn().mockResolvedValue([{ currency: 'INR', _sum: { amount: { toNumber: () => 1250 } } }]) },
      paymentRefund: { groupBy: jest.fn().mockResolvedValue([{ currency: 'INR', _sum: { amount: { toNumber: () => 100 } } }]) },
      rating: { aggregate: jest.fn().mockResolvedValue({ _avg: { score: 4.25 }, _count: { _all: 8 } }) },
      recurringRide: { count: jest.fn().mockResolvedValue(3) },
      recurringRideOccurrence: { count: jest.fn().mockResolvedValueOnce(10).mockResolvedValueOnce(7) },
    };
    const service = new AnalyticsService(prisma as never);

    const result = await service.getMetrics({ from: new Date('2026-01-01T00:00:00Z'), to: new Date('2026-01-31T23:59:59Z') });

    expect(result.rides).toEqual({ total: 10, completed: 6, cancelled: 2 });
    expect(result.drivers).toEqual({ active: 4, utilized: 2, utilizationPercent: 50 });
    expect(result.averages).toEqual({ matchingTimeMinutes: 5, rideDurationMinutes: 45 });
    expect(result.finance).toEqual({ revenueByCurrency: { INR: 1250 }, refundsByCurrency: { INR: 100 } });
    expect(result.ratings).toEqual({ count: 8, averageScore: 4.25 });
    expect(result.recurringRideUsage).toEqual({ activeSchedules: 3, totalOccurrences: 10, generatedOccurrences: 7, usagePercent: 70 });
  });
});
