import { ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import { CustomerStatus, Prisma, RecurringRideOccurrenceStatus, RecurringRideStatus } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import type { AppEnv } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { RideService } from '../ride/ride.service';
import type { RideCreateInput } from '../ride/ride.schemas';
import { RecurringRideQueueService } from './recurring-ride-queue.service';
import type { RecurringRideCancelInput, RecurringRideCreateInput } from './recurring-ride.schemas';

const recurringInclude = { customer: { select: { userId: true } } } satisfies Prisma.RecurringRideInclude;
type RecurringRideWithCustomer = Prisma.RecurringRideGetPayload<{ include: typeof recurringInclude }>;

@Injectable()
export class RecurringRideService {
  private readonly horizonDays: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly rides: RideService,
    private readonly queue: RecurringRideQueueService,
    config: ConfigService<AppEnv>,
  ) { this.horizonDays = config.getOrThrow('RECURRING_RIDE_GENERATION_HORIZON_DAYS'); }

  async create(customerUserId: string, input: RecurringRideCreateInput) {
    const customer = await this.prisma.customer.findUnique({ where: { userId: customerUserId } });
    if (!customer || customer.deletedAt || customer.status !== CustomerStatus.ACTIVE) throw new ForbiddenException('Active customer access required');
    const rule = await this.prisma.recurringRide.create({ data: {
      customerId: customer.id,
      pickupAddress: input.pickupAddress,
      pickupLatitude: new Prisma.Decimal(input.pickupLatitude),
      pickupLongitude: new Prisma.Decimal(input.pickupLongitude),
      pickupPlaceId: input.pickupPlaceId,
      destinationAddress: input.destinationAddress,
      destinationLatitude: new Prisma.Decimal(input.destinationLatitude),
      destinationLongitude: new Prisma.Decimal(input.destinationLongitude),
      destinationPlaceId: input.destinationPlaceId,
      scheduledTime: input.scheduledTime,
      timeZone: input.timeZone,
      daysOfWeek: input.daysOfWeek,
      startDate: this.startOfDay(input.startDate),
      endDate: this.endOfDay(input.endDate),
      seatsRequested: input.seatsRequested,
      estimatedFare: input.estimatedFare === null || input.estimatedFare === undefined ? undefined : new Prisma.Decimal(input.estimatedFare),
      currency: input.currency,
    }, include: recurringInclude });
    await this.queue.schedule(rule.id);
    return rule;
  }

  list(customerUserId: string) { return this.prisma.recurringRide.findMany({ where: { customer: { userId: customerUserId } }, include: { occurrences: { orderBy: { scheduledAt: 'asc' }, take: 100 } }, orderBy: { createdAt: 'desc' } }); }

  async cancel(id: string, customerUserId: string, input: RecurringRideCancelInput) {
    return this.prisma.$transaction(async (transaction) => {
      const rule = await transaction.recurringRide.findUnique({ where: { id }, include: recurringInclude });
      if (!rule || rule.customer.userId !== customerUserId) throw new ForbiddenException('You are not permitted to cancel this recurring ride');
      if (rule.status === RecurringRideStatus.CANCELLED) return rule;
      if (rule.status === RecurringRideStatus.COMPLETED) throw new ConflictException('Recurring ride has already completed');
      const cancelled = await transaction.recurringRide.update({ where: { id }, data: { status: RecurringRideStatus.CANCELLED, cancelledAt: new Date(), cancellationReason: input.reason }, include: recurringInclude });
      await transaction.recurringRideOccurrence.updateMany({ where: { recurringRideId: id, status: { in: [RecurringRideOccurrenceStatus.PENDING, RecurringRideOccurrenceStatus.GENERATING, RecurringRideOccurrenceStatus.FAILED] } }, data: { status: RecurringRideOccurrenceStatus.CANCELLED, lastError: input.reason } });
      await transaction.auditLog.create({ data: { actorUserId: customerUserId, entityType: 'RecurringRide', entityId: id, action: 'RECURRING_RIDE_CANCELLED', metadata: { reason: input.reason } } });
      return cancelled;
    });
  }

  async generateDueRides(now = new Date()) {
    const rules = await this.prisma.recurringRide.findMany({ where: { status: RecurringRideStatus.ACTIVE, startDate: { lte: this.endOfDay(this.addDays(now, this.horizonDays)) }, endDate: { gte: this.startOfDay(now) } }, include: recurringInclude });
    const results = await Promise.all(rules.map((rule) => this.generateRule(rule.id, now)));
    return results.reduce((total, generated) => total + generated.generated, 0);
  }

  async generateRule(id: string, now = new Date()) {
    const rule = await this.prisma.recurringRide.findUnique({ where: { id }, include: recurringInclude });
    if (!rule || rule.status !== RecurringRideStatus.ACTIVE) return { generated: 0, failed: 0 };
    const firstDay = new Date(Math.max(this.startOfDay(rule.startDate).getTime(), this.startOfDay(now).getTime()));
    const lastDay = new Date(Math.min(this.endOfDay(rule.endDate).getTime(), this.endOfDay(this.addDays(now, this.horizonDays)).getTime()));
    let generated = 0;
    let failed = 0;
    for (let day = firstDay; day <= lastDay; day = this.addDays(day, 1)) {
      if (!rule.daysOfWeek.includes(day.getUTCDay())) continue;
      const scheduledAt = this.scheduledAt(day, rule.scheduledTime, rule.timeZone);
      if (scheduledAt <= now) continue;
      const result = await this.generateOccurrence(rule, scheduledAt);
      generated += result === 'GENERATED' ? 1 : 0;
      failed += result === 'FAILED' ? 1 : 0;
    }
    return { generated, failed };
  }

  private async generateOccurrence(rule: RecurringRideWithCustomer, scheduledAt: Date): Promise<'GENERATED' | 'FAILED' | 'SKIPPED'> {
    const occurrence = await this.prisma.recurringRideOccurrence.upsert({ where: { recurringRideId_scheduledAt: { recurringRideId: rule.id, scheduledAt } }, update: {}, create: { recurringRideId: rule.id, scheduledAt } });
    if (([RecurringRideOccurrenceStatus.GENERATED, RecurringRideOccurrenceStatus.CANCELLED, RecurringRideOccurrenceStatus.GENERATING] as RecurringRideOccurrenceStatus[]).includes(occurrence.status)) return 'SKIPPED';
    const claim = await this.prisma.recurringRideOccurrence.updateMany({ where: { id: occurrence.id, status: { in: [RecurringRideOccurrenceStatus.PENDING, RecurringRideOccurrenceStatus.FAILED] } }, data: { status: RecurringRideOccurrenceStatus.GENERATING, attempts: { increment: 1 }, lastError: null } });
    if (claim.count === 0) return 'SKIPPED';
    try {
      const latest = await this.prisma.recurringRide.findUnique({ where: { id: rule.id }, include: recurringInclude });
      if (!latest || latest.status !== RecurringRideStatus.ACTIVE) {
        await this.prisma.recurringRideOccurrence.update({ where: { id: occurrence.id }, data: { status: RecurringRideOccurrenceStatus.CANCELLED } });
        return 'SKIPPED';
      }
      const ride = await this.rides.createRide(rule.customer.userId, this.toRideInput(rule, scheduledAt), rule.id);
      await this.prisma.recurringRideOccurrence.update({ where: { id: occurrence.id }, data: { status: RecurringRideOccurrenceStatus.GENERATED, rideId: ride.id, generatedAt: new Date() } });
      return 'GENERATED';
    } catch (error) {
      await this.prisma.recurringRideOccurrence.update({ where: { id: occurrence.id }, data: { status: RecurringRideOccurrenceStatus.FAILED, lastError: error instanceof Error ? error.message.slice(0, 1_000) : 'Ride generation failed' } });
      return 'FAILED';
    }
  }

  private toRideInput(rule: RecurringRideWithCustomer, scheduledAt: Date): RideCreateInput {
    return { pickupAddress: rule.pickupAddress, pickupLatitude: rule.pickupLatitude.toNumber(), pickupLongitude: rule.pickupLongitude.toNumber(), pickupPlaceId: rule.pickupPlaceId, destinationAddress: rule.destinationAddress, destinationLatitude: rule.destinationLatitude.toNumber(), destinationLongitude: rule.destinationLongitude.toNumber(), destinationPlaceId: rule.destinationPlaceId, scheduledAt, seatsRequested: rule.seatsRequested, estimatedFare: rule.estimatedFare?.toNumber() ?? null, currency: rule.currency };
  }

  private scheduledAt(day: Date, scheduledTime: string, timeZone: string) {
    const [hours, minutes] = scheduledTime.split(':').map(Number);
    const localAsUtc = Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), hours, minutes);
    if (timeZone === 'UTC') return new Date(localAsUtc);
    const formatter = new Intl.DateTimeFormat('en-US', { timeZone, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const parts = Object.fromEntries(formatter.formatToParts(new Date(localAsUtc)).filter(({ type }) => type !== 'literal').map(({ type, value }) => [type, Number(value)]));
    const representedUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour === 24 ? 0 : parts.hour, parts.minute, parts.second);
    return new Date(localAsUtc - (representedUtc - localAsUtc));
  }

  private startOfDay(date: Date) { return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())); }
  private endOfDay(date: Date) { return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59, 999)); }
  private addDays(date: Date, days: number) { const result = new Date(date); result.setUTCDate(result.getUTCDate() + days); return result; }
}
