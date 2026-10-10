import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, WalletTransactionDirection, WalletTransactionStatus, WalletTransactionType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { WalletMutationInput, WalletRefundInput } from './wallet.schemas';

@Injectable()
export class WalletService {
  constructor(private readonly prisma: PrismaService) {}

  async getOrCreateWallet(userId: string) {
    return this.prisma.wallet.upsert({ where: { userId }, update: {}, create: { userId } });
  }

  async getWallet(userId: string) {
    const wallet = await this.getOrCreateWallet(userId);
    const balance = await this.ledgerBalance(wallet.id);
    return { ...wallet, balance, balanceSource: 'COMPLETED_LEDGER' as const };
  }

  async credit(userId: string, input: WalletMutationInput, actorUserId = userId) {
    await this.getOrCreateWallet(userId);
    return this.prisma.$transaction((transaction) => this.apply(transaction, userId, actorUserId, {
      ...input, type: WalletTransactionType.CREDIT, direction: WalletTransactionDirection.CREDIT,
    }));
  }

  async debit(userId: string, input: WalletMutationInput, actorUserId = userId) {
    await this.getOrCreateWallet(userId);
    return this.prisma.$transaction((transaction) => this.apply(transaction, userId, actorUserId, {
      ...input, type: WalletTransactionType.DEBIT, direction: WalletTransactionDirection.DEBIT,
    }));
  }

  async refund(userId: string, input: WalletRefundInput, actorUserId = userId) {
    await this.getOrCreateWallet(userId);
    return this.prisma.$transaction(async (transaction) => {
      const wallet = await this.lockWallet(transaction, userId);
      const existing = await transaction.walletTransaction.findUnique({ where: { walletId_idempotencyKey: { walletId: wallet.id, idempotencyKey: input.idempotencyKey } } });
      if (existing) return this.assertIdempotent(existing, { ...input, type: WalletTransactionType.REFUND, refundOfTransactionId: input.originalTransactionId });
      const original = await transaction.walletTransaction.findUnique({ where: { id: input.originalTransactionId } });
      if (!original || original.walletId !== wallet.id) throw new NotFoundException('Original wallet transaction not found');
      if (original.status !== WalletTransactionStatus.COMPLETED || original.direction !== WalletTransactionDirection.DEBIT) throw new ConflictException('Only completed debits can be refunded');
      const priorRefund = await transaction.walletTransaction.findUnique({ where: { refundOfTransactionId: original.id } });
      if (priorRefund) throw new ConflictException('This transaction has already been refunded');
      if (!new Prisma.Decimal(input.amount).eq(original.amount)) throw new BadRequestException('Refund amount must equal the original debit amount');
      return this.applyLocked(transaction, wallet, actorUserId, {
        ...input, type: WalletTransactionType.REFUND, direction: WalletTransactionDirection.CREDIT, refundOfTransactionId: original.id,
      });
    });
  }

  history(userId: string) {
    return this.prisma.walletTransaction.findMany({ where: { wallet: { userId } }, orderBy: { createdAt: 'desc' }, take: 100 });
  }

  private async apply(transaction: Prisma.TransactionClient, userId: string, actorUserId: string, input: WalletMutationInput & { type: WalletTransactionType; direction: WalletTransactionDirection; refundOfTransactionId?: string }) {
    const wallet = await this.lockWallet(transaction, userId);
    const existing = await transaction.walletTransaction.findUnique({ where: { walletId_idempotencyKey: { walletId: wallet.id, idempotencyKey: input.idempotencyKey } } });
    if (existing) return this.assertIdempotent(existing, input);
    return this.applyLocked(transaction, wallet, actorUserId, input);
  }

  private async applyLocked(transaction: Prisma.TransactionClient, wallet: { id: string; currency: string }, actorUserId: string, input: WalletMutationInput & { type: WalletTransactionType; direction: WalletTransactionDirection; refundOfTransactionId?: string }) {
    const balance = await this.ledgerBalanceForTransaction(transaction, wallet.id);
    const amount = new Prisma.Decimal(input.amount);
    if (input.direction === WalletTransactionDirection.DEBIT && balance.lessThan(amount)) throw new ConflictException('Insufficient wallet balance');
    const nextBalance = input.direction === WalletTransactionDirection.CREDIT ? balance.plus(amount) : balance.minus(amount);
    const created = await transaction.walletTransaction.create({
      data: {
        walletId: wallet.id,
        type: input.type,
        direction: input.direction,
        status: WalletTransactionStatus.COMPLETED,
        amount,
        currency: wallet.currency,
        idempotencyKey: input.idempotencyKey,
        referenceId: input.referenceId,
        balanceAfter: nextBalance,
        refundOfTransactionId: input.refundOfTransactionId,
        metadata: input.metadata as Prisma.InputJsonValue | undefined,
      },
    });
    await transaction.wallet.update({ where: { id: wallet.id }, data: { balance: nextBalance } });
    await transaction.auditLog.create({ data: { actorUserId, entityType: 'WalletTransaction', entityId: created.id, action: `WALLET_${input.type}`, metadata: { walletId: wallet.id, referenceId: input.referenceId } } });
    return created;
  }

  private async lockWallet(transaction: Prisma.TransactionClient, userId: string) {
    const wallet = await transaction.wallet.findUnique({ where: { userId } });
    if (!wallet) throw new NotFoundException('Wallet not found');
    await transaction.$queryRaw`SELECT "id" FROM "Wallet" WHERE "id" = ${wallet.id} FOR UPDATE`;
    return wallet;
  }

  private async ledgerBalanceForTransaction(transaction: Prisma.TransactionClient, walletId: string) {
    const credits = await transaction.walletTransaction.aggregate({ where: { walletId, status: WalletTransactionStatus.COMPLETED, direction: WalletTransactionDirection.CREDIT }, _sum: { amount: true } });
    const debits = await transaction.walletTransaction.aggregate({ where: { walletId, status: WalletTransactionStatus.COMPLETED, direction: WalletTransactionDirection.DEBIT }, _sum: { amount: true } });
    return new Prisma.Decimal(credits._sum.amount ?? 0).minus(debits._sum.amount ?? 0);
  }

  private async ledgerBalance(walletId: string) {
    const [credits, debits] = await Promise.all([
      this.prisma.walletTransaction.aggregate({ where: { walletId, status: WalletTransactionStatus.COMPLETED, direction: WalletTransactionDirection.CREDIT }, _sum: { amount: true } }),
      this.prisma.walletTransaction.aggregate({ where: { walletId, status: WalletTransactionStatus.COMPLETED, direction: WalletTransactionDirection.DEBIT }, _sum: { amount: true } }),
    ]);
    return new Prisma.Decimal(credits._sum.amount ?? 0).minus(debits._sum.amount ?? 0);
  }

  private assertIdempotent(existing: { type: WalletTransactionType; amount: Prisma.Decimal; referenceId: string; refundOfTransactionId: string | null }, input: WalletMutationInput & { type: WalletTransactionType; refundOfTransactionId?: string }) {
    if (existing.type !== input.type || !new Prisma.Decimal(input.amount).eq(existing.amount) || existing.referenceId !== input.referenceId || (input.refundOfTransactionId ?? null) !== existing.refundOfTransactionId) throw new ConflictException('Idempotency key was already used for a different transaction');
    return existing;
  }
}
