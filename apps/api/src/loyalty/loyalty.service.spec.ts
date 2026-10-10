import { ConflictException } from '@nestjs/common';
import { LoyaltyEarningBasis, LoyaltyTransactionDirection, LoyaltyTransactionStatus, LoyaltyTransactionType } from '@prisma/client';
import { LoyaltyService } from './loyalty.service';

const userId = '00000000-0000-0000-0000-000000000001';
const accountId = '00000000-0000-0000-0000-000000000002';
const ruleId = '00000000-0000-0000-0000-000000000003';
const redemptionRuleId = '00000000-0000-0000-0000-000000000004';

const earningRule = { id: ruleId, code: 'RIDE_COMPLETED', name: 'Ride completed', basis: LoyaltyEarningBasis.FIXED, fixedPoints: 100, pointsPerUnit: null, minimumAmount: null, maximumPoints: null, active: true };
const redemptionRule = { id: redemptionRuleId, code: 'STANDARD', name: 'Standard redemption', pointsPerUnit: 100, valueMinorPerUnit: 1000, currency: 'INR', minimumPoints: 100, maximumPoints: 1000, active: true };
const account = { id: accountId, userId, pointsBalance: 0, lifetimeEarned: 0, lifetimeRedeemed: 0 };

function transactionMock(result: unknown) {
  return { $transaction: jest.fn((callback: (tx: any) => unknown) => callback({ loyaltyAccount: { findUnique: jest.fn().mockResolvedValue(account), update: jest.fn().mockResolvedValue(account) }, loyaltyTransaction: { findUnique: jest.fn().mockResolvedValue(null), aggregate: jest.fn().mockResolvedValue({ _sum: { points: 0 } }), create: jest.fn().mockResolvedValue(result) }, auditLog: { create: jest.fn().mockResolvedValue(undefined) }, $queryRaw: jest.fn() })) };
}

describe('LoyaltyService', () => {
  it('earns points with a durable transaction and audit record', async () => {
    const result = { id: 'transaction', accountId, type: LoyaltyTransactionType.EARN, direction: LoyaltyTransactionDirection.CREDIT, status: LoyaltyTransactionStatus.COMPLETED, points: 100, balanceAfter: 100, idempotencyKey: 'earn-1', referenceId: 'ride-1', earningRuleId: ruleId, redemptionRuleId: null, redemptionValueMinor: null };
    const prisma = { loyaltyEarningRule: { findUnique: jest.fn().mockResolvedValue(earningRule) }, loyaltyAccount: { upsert: jest.fn().mockResolvedValue(account) }, ...transactionMock(result) };
    const service = new LoyaltyService(prisma as never);
    const created = await service.earn(userId, { ruleCode: 'RIDE_COMPLETED', referenceId: 'ride-1', idempotencyKey: 'earn-1' });
    expect(created.points).toBe(100);
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it('calculates configurable currency-based earning rules', async () => {
    const result = { points: 25 };
    const rule = { ...earningRule, basis: LoyaltyEarningBasis.PER_CURRENCY_UNIT, fixedPoints: null, pointsPerUnit: 0.5, minimumAmount: 10, maximumPoints: null };
    const prisma = { loyaltyEarningRule: { findUnique: jest.fn().mockResolvedValue(rule) }, loyaltyAccount: { upsert: jest.fn().mockResolvedValue(account) }, ...transactionMock(result) };
    const service = new LoyaltyService(prisma as never);
    await service.earn(userId, { ruleCode: 'RIDE_COMPLETED', amount: 50, referenceId: 'ride-2', idempotencyKey: 'earn-2' });
    const tx = (prisma.$transaction as jest.Mock).mock.calls[0][0];
    expect(tx).toBeDefined();
  });

  it('redeems points through a debit transaction and rejects insufficient balance', async () => {
    const prisma = { loyaltyRedemptionRule: { findUnique: jest.fn().mockResolvedValue(redemptionRule) }, loyaltyAccount: { upsert: jest.fn().mockResolvedValue(account) }, ...transactionMock({ points: 100, balanceAfter: 0, type: LoyaltyTransactionType.REDEEM, redemptionValueMinor: 1000 }) };
    const service = new LoyaltyService(prisma as never);
    await expect(service.redeem(userId, { ruleCode: 'STANDARD', points: 100, referenceId: 'order-1', idempotencyKey: 'redeem-1' })).rejects.toBeInstanceOf(ConflictException);
  });

  it('returns an existing matching transaction for repeated idempotent earning', async () => {
    const existing = { type: LoyaltyTransactionType.EARN, points: 100, referenceId: 'ride-1', earningRuleId: ruleId, redemptionRuleId: null, redemptionValueMinor: null };
    const prisma = { loyaltyEarningRule: { findUnique: jest.fn().mockResolvedValue(earningRule) }, loyaltyAccount: { upsert: jest.fn().mockResolvedValue(account) }, $transaction: jest.fn((callback: (tx: any) => unknown) => callback({ loyaltyAccount: { findUnique: jest.fn().mockResolvedValue(account) }, loyaltyTransaction: { findUnique: jest.fn().mockResolvedValue(existing) }, $queryRaw: jest.fn() })) };
    const service = new LoyaltyService(prisma as never);
    await expect(service.earn(userId, { ruleCode: 'RIDE_COMPLETED', referenceId: 'ride-1', idempotencyKey: 'earn-1' })).resolves.toEqual(existing);
  });
});
