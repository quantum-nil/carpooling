import { ConflictException } from '@nestjs/common';
import { Prisma, WalletTransactionDirection, WalletTransactionStatus, WalletTransactionType } from '@prisma/client';
import { WalletService } from './wallet.service';

const userId = '00000000-0000-0000-0000-000000000001';
const wallet = { id: '00000000-0000-0000-0000-000000000002', currency: 'INR' };

function transactionMock(existing: unknown = null, balance = 0) {
  const tx = {
    wallet: { findUnique: jest.fn().mockResolvedValue(wallet), update: jest.fn() },
    walletTransaction: {
      findUnique: jest.fn().mockResolvedValue(existing),
      aggregate: jest.fn().mockImplementation(({ where }: { where: { direction: WalletTransactionDirection } }) => Promise.resolve({ _sum: { amount: where.direction === WalletTransactionDirection.CREDIT ? new Prisma.Decimal(balance) : new Prisma.Decimal(0) } })),
      create: jest.fn().mockResolvedValue({ id: 'transaction', type: WalletTransactionType.CREDIT, amount: new Prisma.Decimal(10), referenceId: 'ref', refundOfTransactionId: null }),
    },
    auditLog: { create: jest.fn() },
    $queryRaw: jest.fn(),
  };
  return tx;
}

describe('WalletService', () => {
  it('uses the completed ledger to reject an overdraft', async () => {
    const tx = transactionMock(null, 5);
    const prisma = { wallet: { upsert: jest.fn().mockResolvedValue(wallet) }, $transaction: jest.fn((callback: (transaction: typeof tx) => unknown) => callback(tx)) };
    const service = new WalletService(prisma as never);

    await expect(service.debit(userId, { amount: 10, idempotencyKey: 'debit-1', referenceId: 'ride-1' })).rejects.toThrow('Insufficient wallet balance');
    expect(tx.wallet.update).not.toHaveBeenCalled();
  });

  it('returns the original transaction for an identical idempotent retry', async () => {
    const existing = { type: WalletTransactionType.CREDIT, amount: new Prisma.Decimal(10), referenceId: 'ref', refundOfTransactionId: null };
    const tx = transactionMock(existing);
    const prisma = { wallet: { upsert: jest.fn().mockResolvedValue(wallet) }, $transaction: jest.fn((callback: (transaction: typeof tx) => unknown) => callback(tx)) };
    const service = new WalletService(prisma as never);

    const result = await service.credit(userId, { amount: 10, idempotencyKey: 'same', referenceId: 'ref' });

    expect(result).toBe(existing);
    expect(tx.walletTransaction.create).not.toHaveBeenCalled();
  });

  it('rejects reuse of an idempotency key with different parameters', async () => {
    const existing = { type: WalletTransactionType.CREDIT, amount: new Prisma.Decimal(10), referenceId: 'ref', refundOfTransactionId: null };
    const tx = transactionMock(existing);
    const prisma = { wallet: { upsert: jest.fn().mockResolvedValue(wallet) }, $transaction: jest.fn((callback: (transaction: typeof tx) => unknown) => callback(tx)) };
    const service = new WalletService(prisma as never);

    await expect(service.credit(userId, { amount: 11, idempotencyKey: 'same', referenceId: 'ref' })).rejects.toBeInstanceOf(ConflictException);
  });

  it('locks the wallet before calculating and writing a balance-affecting transaction', async () => {
    const tx = transactionMock(null, 20);
    const prisma = { wallet: { upsert: jest.fn().mockResolvedValue(wallet) }, $transaction: jest.fn((callback: (transaction: typeof tx) => unknown) => callback(tx)) };
    const service = new WalletService(prisma as never);

    await service.debit(userId, { amount: 10, idempotencyKey: 'debit-2', referenceId: 'ride-2' });

    expect(tx.$queryRaw).toHaveBeenCalled();
    expect(tx.walletTransaction.aggregate).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ status: WalletTransactionStatus.COMPLETED }) }));
  });

  it('rejects a second refund of the same debit', async () => {
    const originalId = '00000000-0000-0000-0000-000000000003';
    const original = { id: originalId, walletId: wallet.id, type: WalletTransactionType.DEBIT, direction: WalletTransactionDirection.DEBIT, status: WalletTransactionStatus.COMPLETED, amount: new Prisma.Decimal(10) };
    const priorRefund = { id: 'refund' };
    const tx = transactionMock();
    tx.walletTransaction.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(original)
      .mockResolvedValueOnce(priorRefund);
    const prisma = { wallet: { upsert: jest.fn().mockResolvedValue(wallet) }, $transaction: jest.fn((callback: (transaction: typeof tx) => unknown) => callback(tx)) };
    const service = new WalletService(prisma as never);

    await expect(service.refund(userId, { amount: 10, idempotencyKey: 'refund-2', referenceId: 'payment-1', originalTransactionId: originalId })).rejects.toThrow('already been refunded');
    expect(tx.walletTransaction.create).not.toHaveBeenCalled();
  });

  it('runs concurrent mutations through separate database transactions and row locks', async () => {
    const tx1 = transactionMock(null, 20);
    const tx2 = transactionMock(null, 20);
    const transactions = [tx1, tx2];
    const prisma = {
      wallet: { upsert: jest.fn().mockResolvedValue(wallet) },
      $transaction: jest.fn((callback: (transaction: typeof tx1) => unknown) => callback(transactions.shift()!)),
    };
    const service = new WalletService(prisma as never);

    await Promise.all([
      service.debit(userId, { amount: 10, idempotencyKey: 'concurrent-1', referenceId: 'ride-1' }),
      service.debit(userId, { amount: 10, idempotencyKey: 'concurrent-2', referenceId: 'ride-2' }),
    ]);

    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    expect(tx1.$queryRaw).toHaveBeenCalledTimes(1);
    expect(tx2.$queryRaw).toHaveBeenCalledTimes(1);
  });
});
