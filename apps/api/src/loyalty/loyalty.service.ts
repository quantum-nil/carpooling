import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { LoyaltyEarningBasis, LoyaltyTransactionDirection, LoyaltyTransactionStatus, LoyaltyTransactionType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { EarnPointsInput, EarningRuleInput, RedeemPointsInput, RedemptionRuleInput } from './loyalty.schemas';

@Injectable()
export class LoyaltyService {
  constructor(private readonly prisma: PrismaService) {}

  async getAccount(userId: string) {
    const account = await this.prisma.loyaltyAccount.upsert({ where: { userId }, update: {}, create: { userId } });
    const pointsBalance = await this.ledgerBalance(account.id);
    return { ...account, pointsBalance, balanceSource: 'COMPLETED_LOYALTY_LEDGER' as const };
  }

  history(userId: string) {
    return this.prisma.loyaltyTransaction.findMany({ where: { account: { userId } }, orderBy: { createdAt: 'desc' }, take: 100 });
  }

  listEarningRules() { return this.prisma.loyaltyEarningRule.findMany({ orderBy: { code: 'asc' } }); }
  listRedemptionRules() { return this.prisma.loyaltyRedemptionRule.findMany({ orderBy: { code: 'asc' } }); }

  createEarningRule(input: EarningRuleInput) {
    return this.prisma.loyaltyEarningRule.create({ data: { code: input.code, name: input.name, basis: input.basis as LoyaltyEarningBasis, fixedPoints: input.fixedPoints, pointsPerUnit: input.pointsPerUnit === undefined ? undefined : new Prisma.Decimal(input.pointsPerUnit), minimumAmount: input.minimumAmount === undefined ? undefined : new Prisma.Decimal(input.minimumAmount), maximumPoints: input.maximumPoints, active: input.active } });
  }

  createRedemptionRule(input: RedemptionRuleInput) {
    return this.prisma.loyaltyRedemptionRule.create({ data: input });
  }

  async earn(userId: string, input: EarnPointsInput, actorUserId = userId) {
    const rule = await this.prisma.loyaltyEarningRule.findUnique({ where: { code: input.ruleCode } });
    if (!rule || !rule.active) throw new BadRequestException('Active earning rule not found');
    const points = this.calculateEarnedPoints(rule, input.amount);
    if (points <= 0) throw new BadRequestException('Earning event does not produce points');
    const account = await this.prisma.loyaltyAccount.upsert({ where: { userId }, update: {}, create: { userId } });
    return this.prisma.$transaction(async (transaction) => {
      const locked = await this.lockAccount(transaction, account.id);
      const existing = await transaction.loyaltyTransaction.findUnique({ where: { accountId_idempotencyKey: { accountId: account.id, idempotencyKey: input.idempotencyKey } } });
      if (existing) return this.assertIdempotent(existing, { type: LoyaltyTransactionType.EARN, points, referenceId: input.referenceId, ruleId: rule.id });
      const balance = await this.ledgerBalanceForTransaction(transaction, locked.id);
      const created = await transaction.loyaltyTransaction.create({ data: { accountId: locked.id, type: LoyaltyTransactionType.EARN, direction: LoyaltyTransactionDirection.CREDIT, status: LoyaltyTransactionStatus.COMPLETED, points, balanceAfter: balance + points, idempotencyKey: input.idempotencyKey, referenceId: input.referenceId, earningRuleId: rule.id, metadata: input.metadata as Prisma.InputJsonValue | undefined } });
      await transaction.loyaltyAccount.update({ where: { id: locked.id }, data: { pointsBalance: balance + points, lifetimeEarned: { increment: points } } });
      await transaction.auditLog.create({ data: { actorUserId, entityType: 'LoyaltyTransaction', entityId: created.id, action: 'LOYALTY_POINTS_EARNED', metadata: { accountId: locked.id, points, referenceId: input.referenceId, ruleCode: rule.code } } });
      return created;
    });
  }

  async redeem(userId: string, input: RedeemPointsInput, actorUserId = userId) {
    const rule = await this.prisma.loyaltyRedemptionRule.findUnique({ where: { code: input.ruleCode } });
    if (!rule || !rule.active) throw new BadRequestException('Active redemption rule not found');
    if (input.points < rule.minimumPoints || (rule.maximumPoints !== null && input.points > rule.maximumPoints)) throw new BadRequestException('Points are outside the redemption rule limits');
    if (input.points % rule.pointsPerUnit !== 0) throw new BadRequestException('Points must be redeemed in configured units');
    const account = await this.prisma.loyaltyAccount.upsert({ where: { userId }, update: {}, create: { userId } });
    return this.prisma.$transaction(async (transaction) => {
      const locked = await this.lockAccount(transaction, account.id);
      const existing = await transaction.loyaltyTransaction.findUnique({ where: { accountId_idempotencyKey: { accountId: account.id, idempotencyKey: input.idempotencyKey } } });
      const redemptionValueMinor = (input.points / rule.pointsPerUnit) * rule.valueMinorPerUnit;
      if (existing) return this.assertIdempotent(existing, { type: LoyaltyTransactionType.REDEEM, points: input.points, referenceId: input.referenceId, ruleId: rule.id, redemptionValueMinor });
      const balance = await this.ledgerBalanceForTransaction(transaction, locked.id);
      if (balance < input.points) throw new ConflictException('Insufficient loyalty points');
      const created = await transaction.loyaltyTransaction.create({ data: { accountId: locked.id, type: LoyaltyTransactionType.REDEEM, direction: LoyaltyTransactionDirection.DEBIT, status: LoyaltyTransactionStatus.COMPLETED, points: input.points, balanceAfter: balance - input.points, idempotencyKey: input.idempotencyKey, referenceId: input.referenceId, redemptionRuleId: rule.id, redemptionValueMinor, currency: rule.currency, metadata: input.metadata as Prisma.InputJsonValue | undefined } });
      await transaction.loyaltyAccount.update({ where: { id: locked.id }, data: { pointsBalance: balance - input.points, lifetimeRedeemed: { increment: input.points } } });
      await transaction.auditLog.create({ data: { actorUserId, entityType: 'LoyaltyTransaction', entityId: created.id, action: 'LOYALTY_POINTS_REDEEMED', metadata: { accountId: locked.id, points: input.points, referenceId: input.referenceId, ruleCode: rule.code, redemptionValueMinor } } });
      return created;
    });
  }

  private calculateEarnedPoints(rule: { basis: LoyaltyEarningBasis; fixedPoints: number | null; pointsPerUnit: Prisma.Decimal | null; minimumAmount: Prisma.Decimal | null; maximumPoints: number | null }, amount?: number) {
    if (rule.basis === LoyaltyEarningBasis.FIXED) return rule.fixedPoints ?? 0;
    if (amount === undefined || (rule.minimumAmount && new Prisma.Decimal(amount).lessThan(rule.minimumAmount))) return 0;
    const calculated = new Prisma.Decimal(amount).mul(rule.pointsPerUnit ?? 0).floor().toNumber();
    return rule.maximumPoints === null ? calculated : Math.min(calculated, rule.maximumPoints);
  }

  private async lockAccount(transaction: Prisma.TransactionClient, accountId: string) {
    const account = await transaction.loyaltyAccount.findUnique({ where: { id: accountId } });
    if (!account) throw new NotFoundException('Loyalty account not found');
    await transaction.$queryRaw`SELECT "id" FROM "LoyaltyAccount" WHERE "id" = ${account.id} FOR UPDATE`;
    return account;
  }

  private async ledgerBalanceForTransaction(transaction: Prisma.TransactionClient, accountId: string) {
    const [credits, debits] = await Promise.all([
      transaction.loyaltyTransaction.aggregate({ where: { accountId, status: LoyaltyTransactionStatus.COMPLETED, direction: LoyaltyTransactionDirection.CREDIT }, _sum: { points: true } }),
      transaction.loyaltyTransaction.aggregate({ where: { accountId, status: LoyaltyTransactionStatus.COMPLETED, direction: LoyaltyTransactionDirection.DEBIT }, _sum: { points: true } }),
    ]);
    return (credits._sum.points ?? 0) - (debits._sum.points ?? 0);
  }

  private async ledgerBalance(accountId: string) {
    const [credits, debits] = await Promise.all([
      this.prisma.loyaltyTransaction.aggregate({ where: { accountId, status: LoyaltyTransactionStatus.COMPLETED, direction: LoyaltyTransactionDirection.CREDIT }, _sum: { points: true } }),
      this.prisma.loyaltyTransaction.aggregate({ where: { accountId, status: LoyaltyTransactionStatus.COMPLETED, direction: LoyaltyTransactionDirection.DEBIT }, _sum: { points: true } }),
    ]);
    return (credits._sum.points ?? 0) - (debits._sum.points ?? 0);
  }

  private assertIdempotent(existing: { type: LoyaltyTransactionType; points: number; referenceId: string; earningRuleId: string | null; redemptionRuleId: string | null; redemptionValueMinor: number | null }, input: { type: LoyaltyTransactionType; points: number; referenceId: string; ruleId: string; redemptionValueMinor?: number }) {
    const ruleMatches = existing.earningRuleId === input.ruleId || existing.redemptionRuleId === input.ruleId;
    if (existing.type !== input.type || existing.points !== input.points || existing.referenceId !== input.referenceId || !ruleMatches || (input.redemptionValueMinor ?? null) !== existing.redemptionValueMinor) throw new ConflictException('Idempotency key was already used for a different loyalty transaction');
    return existing;
  }
}
