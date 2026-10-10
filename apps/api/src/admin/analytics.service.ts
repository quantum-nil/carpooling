import { Injectable } from '@nestjs/common';
import { PaymentStatus, PaymentRefundStatus, RatingStatus, RecurringRideOccurrenceStatus, EmployeeStatus, DriverStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { AnalyticsQuery } from './admin.schemas';

export interface AnalyticsResult {
  period: { from: Date; to: Date };
  rides: { total: number; completed: number; cancelled: number };
  drivers: { active: number; utilized: number; utilizationPercent: number };
  averages: { matchingTimeMinutes: number | null; rideDurationMinutes: number | null };
  finance: { revenueByCurrency: Record<string, number>; refundsByCurrency: Record<string, number> };
  ratings: { count: number; averageScore: number };
  recurringRideUsage: { activeSchedules: number; totalOccurrences: number; generatedOccurrences: number; usagePercent: number };
}

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async getMetrics(query: AnalyticsQuery): Promise<AnalyticsResult> {
    const to = query.to ?? new Date();
    const from = query.from ?? new Date(to.getTime() - 30 * 24 * 60 * 60 * 1_000);
    if (from > to) throw new Error('Analytics from must be before to');
    const period = { from, to };
    const dateFilter = { gte: from, lte: to };
    const [total, completed, cancelled, activeDrivers, utilizedDriverRows, matchingRows, durationRows, revenue, refunds, ratingAggregate, activeSchedules, occurrenceTotal, occurrenceGenerated] = await Promise.all([
      this.prisma.ride.count({ where: { createdAt: dateFilter } }),
      this.prisma.ride.count({ where: { completedAt: dateFilter, status: 'COMPLETED' } }),
      this.prisma.ride.count({ where: { cancelledAt: dateFilter, status: 'CANCELLED' } }),
      this.prisma.employee.count({ where: { status: EmployeeStatus.ACTIVE, driverStatus: DriverStatus.ACTIVE, deletedAt: null } }),
      this.prisma.ride.findMany({ where: { createdAt: dateFilter, driverId: { not: null }, status: { notIn: ['CANCELLED', 'EXPIRED'] } }, select: { driverId: true }, distinct: ['driverId'] }),
      this.prisma.ride.findMany({ where: { createdAt: dateFilter }, select: { createdAt: true, offers: { select: { createdAt: true }, orderBy: { createdAt: 'asc' }, take: 1 } } }),
      this.prisma.ride.findMany({ where: { completedAt: dateFilter, status: 'COMPLETED', startedAt: { not: null } }, select: { startedAt: true, completedAt: true } }),
      this.prisma.payment.groupBy({ by: ['currency'], where: { status: PaymentStatus.CAPTURED, paidAt: dateFilter }, _sum: { amount: true } }),
      this.prisma.paymentRefund.groupBy({ by: ['currency'], where: { status: PaymentRefundStatus.COMPLETED, createdAt: dateFilter }, _sum: { amount: true } }),
      this.prisma.rating.aggregate({ where: { status: RatingStatus.PUBLISHED, createdAt: dateFilter }, _avg: { score: true }, _count: { _all: true } }),
      this.prisma.recurringRide.count({ where: { status: 'ACTIVE' } }),
      this.prisma.recurringRideOccurrence.count({ where: { scheduledAt: dateFilter } }),
      this.prisma.recurringRideOccurrence.count({ where: { generatedAt: dateFilter, status: RecurringRideOccurrenceStatus.GENERATED } }),
    ]);
    const matchingDurations = matchingRows.flatMap((ride) => ride.offers[0] ? [ride.offers[0].createdAt.getTime() - ride.createdAt.getTime()] : []);
    const rideDurations = durationRows.flatMap((ride) => ride.startedAt && ride.completedAt ? [ride.completedAt.getTime() - ride.startedAt.getTime()] : []);
    const utilized = utilizedDriverRows.length;
    return {
      period,
      rides: { total, completed, cancelled },
      drivers: { active: activeDrivers, utilized, utilizationPercent: percentage(utilized, activeDrivers) },
      averages: { matchingTimeMinutes: averageMinutes(matchingDurations), rideDurationMinutes: averageMinutes(rideDurations) },
      finance: { revenueByCurrency: totalsByCurrency(revenue), refundsByCurrency: totalsByCurrency(refunds) },
      ratings: { count: ratingAggregate._count._all, averageScore: Number((ratingAggregate._avg.score ?? 0).toFixed(2)) },
      recurringRideUsage: { activeSchedules: activeSchedules, totalOccurrences: occurrenceTotal, generatedOccurrences: occurrenceGenerated, usagePercent: percentage(occurrenceGenerated, occurrenceTotal) },
    };
  }
}

export function averageMinutes(durationsMilliseconds: number[]) {
  if (!durationsMilliseconds.length) return null;
  return Number((durationsMilliseconds.reduce((sum, value) => sum + value, 0) / durationsMilliseconds.length / 60_000).toFixed(2));
}

export function percentage(value: number, total: number) { return total === 0 ? 0 : Number(((value / total) * 100).toFixed(2)); }

function totalsByCurrency(rows: Array<{ currency: string; _sum: { amount: Prisma.Decimal | null } }>) {
  return Object.fromEntries(rows.map((row) => [row.currency, row._sum.amount?.toNumber() ?? 0]));
}
