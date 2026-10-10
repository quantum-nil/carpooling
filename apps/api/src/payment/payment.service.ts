import { BadGatewayException, ConflictException, ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { PaymentRefundStatus, PaymentStatus, PaymentWebhookStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PAYMENT_PROVIDER, type PaymentProvider, type PaymentWebhook } from './payment.types';
import { Inject } from '@nestjs/common';
import type { CreatePaymentInput, RefundInput, VerifyPaymentInput } from './payment.schemas';

@Injectable()
export class PaymentService {
  constructor(private readonly prisma: PrismaService, @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider) {}

  async createOrder(userId: string, input: CreatePaymentInput) {
    const existing = await this.prisma.payment.findUnique({ where: { userId_idempotencyKey: { userId, idempotencyKey: input.idempotencyKey } } });
    if (existing) return this.assertCreateIdempotency(existing, input);
    let payment;
    try {
      payment = await this.prisma.payment.create({ data: { userId, amount: new Prisma.Decimal(input.amount), currency: input.currency, referenceId: input.referenceId, idempotencyKey: input.idempotencyKey, metadata: input.metadata as Prisma.InputJsonValue | undefined } });
    } catch (error) {
      if (!this.isUniqueViolation(error)) throw error;
      const concurrent = await this.prisma.payment.findUniqueOrThrow({ where: { userId_idempotencyKey: { userId, idempotencyKey: input.idempotencyKey } } });
      return this.assertCreateIdempotency(concurrent, input);
    }

    try {
      const order = await this.provider.createOrder({ amountMinor: Math.round(input.amount * 100), currency: input.currency, receipt: payment.id, notes: { referenceId: input.referenceId } });
      if (order.amountMinor !== Math.round(input.amount * 100) || order.currency !== input.currency) throw new Error('Provider order amount or currency mismatch');
      return this.prisma.payment.update({ where: { id: payment.id }, data: { providerOrderId: order.id } });
    } catch (error) {
      const failed = await this.prisma.payment.update({ where: { id: payment.id }, data: { status: PaymentStatus.FAILED, failureMessage: error instanceof Error ? error.message : 'Payment order creation failed' } });
      return failed;
    }
  }

  async verifyPayment(userId: string, paymentId: string, input: VerifyPaymentInput) {
    const payment = await this.findOwnedPayment(paymentId, userId);
    if (!payment.providerOrderId || payment.providerOrderId !== input.orderId) throw new UnauthorizedException('Payment order mismatch');
    try {
      await this.provider.verifyPayment({ orderId: input.orderId, paymentId: input.paymentId, signature: input.signature });
    } catch { throw new UnauthorizedException('Invalid payment signature'); }
    return this.prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT "id" FROM "Payment" WHERE "id" = ${payment.id} FOR UPDATE`;
      const current = await transaction.payment.findUniqueOrThrow({ where: { id: payment.id } });
      if (current.status === PaymentStatus.REFUNDED) throw new ConflictException('Payment is already refunded');
      if (current.providerPaymentId && current.providerPaymentId !== input.paymentId) throw new ConflictException('Payment is linked to a different provider payment');
      if (current.status === PaymentStatus.CAPTURED || current.status === PaymentStatus.AUTHORIZED) return current;
      return transaction.payment.update({ where: { id: current.id }, data: { providerPaymentId: input.paymentId, status: PaymentStatus.AUTHORIZED, verifiedAt: new Date() } });
    });
  }

  getPayment(userId: string, paymentId: string) { return this.findOwnedPayment(paymentId, userId); }

  async refund(userId: string, paymentId: string, input: RefundInput) {
    const payment = await this.findOwnedPayment(paymentId, userId);
    if (!payment.providerPaymentId || !([PaymentStatus.AUTHORIZED, PaymentStatus.CAPTURED, PaymentStatus.PARTIALLY_REFUNDED] as PaymentStatus[]).includes(payment.status)) throw new ConflictException('Payment is not refundable');
    const amount = new Prisma.Decimal(input.amount ?? payment.amount);
    const reservation = await this.prisma.$transaction(async (transaction) => {
        await transaction.$queryRaw`SELECT "id" FROM "Payment" WHERE "id" = ${payment.id} FOR UPDATE`;
        const current = await transaction.payment.findUnique({ where: { id: payment.id } });
        if (!current) throw new NotFoundException('Payment not found');
        const existing = await transaction.paymentRefund.findUnique({ where: { paymentId_idempotencyKey: { paymentId: current.id, idempotencyKey: input.idempotencyKey } } });
        if (existing) return { refund: this.assertRefundIdempotency(existing, amount, input.reason), created: false as const };
        const reserved = await transaction.paymentRefund.aggregate({ where: { paymentId: current.id, status: { in: [PaymentRefundStatus.REQUESTED, PaymentRefundStatus.PROCESSING, PaymentRefundStatus.COMPLETED] } }, _sum: { amount: true } });
        if (new Prisma.Decimal(reserved._sum.amount ?? 0).plus(amount).greaterThan(current.amount)) throw new ConflictException('Refund amount exceeds the payment amount');
        return { refund: await transaction.paymentRefund.create({ data: { paymentId: current.id, amount, currency: current.currency, idempotencyKey: input.idempotencyKey, reason: input.reason, status: PaymentRefundStatus.PROCESSING } }), created: true as const };
    });

    if (!reservation.created) return reservation.refund;
    const refund = reservation.refund;
    try {
      if (!payment.providerPaymentId) throw new Error('Missing provider payment ID');
      const providerRefund = await this.provider.createRefund({ paymentId: payment.providerPaymentId, amountMinor: Math.round(amount.toNumber() * 100), notes: input.reason ? { reason: input.reason } : undefined });
      return this.prisma.$transaction(async (transaction) => {
        const updated = await transaction.paymentRefund.update({ where: { id: refund.id }, data: { status: PaymentRefundStatus.COMPLETED, providerRefundId: providerRefund.id } });
        const nextStatus = amount.eq(payment.amount) ? PaymentStatus.REFUNDED : PaymentStatus.PARTIALLY_REFUNDED;
        await transaction.payment.update({ where: { id: payment.id }, data: { status: nextStatus } });
        return updated;
      });
    } catch (error) {
      return this.prisma.paymentRefund.update({ where: { id: refund.id }, data: { status: PaymentRefundStatus.FAILED, failureMessage: error instanceof Error ? error.message : 'Refund failed' } });
    }
  }

  async processWebhook(rawBody: Buffer, signature: string, providerEventId: string) {
    try { this.provider.verifyWebhook(rawBody, signature); } catch { throw new UnauthorizedException('Invalid webhook signature'); }
    let event: PaymentWebhook;
    try { event = this.provider.parseWebhook(rawBody, providerEventId); } catch { throw new BadGatewayException('Invalid payment webhook payload'); }
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const duplicate = await transaction.paymentWebhookEvent.findUnique({ where: { providerEventId: event.providerEventId } });
        if (duplicate) return { duplicate: true, status: duplicate.status };
        const payment = await this.paymentForWebhook(transaction, event);
        if (!payment) throw new NotFoundException('Payment referenced by webhook not found');
        await transaction.$queryRaw`SELECT "id" FROM "Payment" WHERE "id" = ${payment.id} FOR UPDATE`;
        await transaction.paymentWebhookEvent.create({ data: { providerEventId: event.providerEventId, eventType: event.eventType, paymentId: payment.id, payload: event.payload as unknown as Prisma.InputJsonValue } });
        if (event.kind === 'PAYMENT_CAPTURED') {
          const paymentEvent = event as Extract<PaymentWebhook, { kind: 'PAYMENT_CAPTURED' }>;
          if (payment.providerOrderId !== paymentEvent.orderId || payment.amount.times(100).toNumber() !== paymentEvent.amountMinor || payment.currency !== paymentEvent.currency) throw new ConflictException('Webhook payment details do not match the order');
          if (payment.status !== PaymentStatus.CAPTURED && payment.status !== PaymentStatus.REFUNDED) await transaction.payment.update({ where: { id: payment.id }, data: { status: PaymentStatus.CAPTURED, providerPaymentId: event.paymentId, paidAt: new Date() } });
        } else if (event.kind === 'PAYMENT_FAILED') {
          if (!([PaymentStatus.CAPTURED, PaymentStatus.REFUNDED] as PaymentStatus[]).includes(payment.status)) await transaction.payment.update({ where: { id: payment.id }, data: { status: PaymentStatus.FAILED, providerPaymentId: event.paymentId, failureCode: event.errorCode, failureMessage: event.errorMessage } });
        } else {
          const refund = await transaction.paymentRefund.findFirst({ where: { paymentId: payment.id, providerRefundId: event.refundId } });
          if (refund) {
            await transaction.paymentRefund.update({ where: { id: refund.id }, data: { status: event.kind === 'REFUND_PROCESSED' ? PaymentRefundStatus.COMPLETED : PaymentRefundStatus.FAILED, failureMessage: event.errorMessage } });
            if (event.kind === 'REFUND_PROCESSED') await transaction.payment.update({ where: { id: payment.id }, data: { status: refund.amount.eq(payment.amount) ? PaymentStatus.REFUNDED : PaymentStatus.PARTIALLY_REFUNDED } });
          }
        }
        await transaction.paymentWebhookEvent.update({ where: { providerEventId: event.providerEventId }, data: { status: PaymentWebhookStatus.PROCESSED, processedAt: new Date() } });
        return { duplicate: false, status: PaymentWebhookStatus.PROCESSED };
      });
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      if (this.isUniqueViolation(error)) return { duplicate: true, status: 'PROCESSED' };
      throw error;
    }
  }

  private paymentForWebhook(transaction: Prisma.TransactionClient, event: PaymentWebhook) {
    return event.kind === 'REFUND_PROCESSED' || event.kind === 'REFUND_FAILED'
      ? transaction.payment.findUnique({ where: { providerPaymentId: event.paymentId } })
      : transaction.payment.findUnique({ where: { providerOrderId: (event as Extract<PaymentWebhook, { orderId: string }>).orderId } });
  }

  private async findOwnedPayment(paymentId: string, userId: string) {
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment) throw new NotFoundException('Payment not found');
    if (payment.userId !== userId) throw new ForbiddenException('You are not permitted to access this payment');
    return payment;
  }

  private assertCreateIdempotency(existing: { amount: Prisma.Decimal; currency: string; referenceId: string; providerOrderId: string | null; status: PaymentStatus }, input: CreatePaymentInput) {
    if (!new Prisma.Decimal(input.amount).eq(existing.amount) || input.currency !== existing.currency || input.referenceId !== existing.referenceId) throw new ConflictException('Idempotency key was already used for a different payment');
    return existing;
  }

  private assertRefundIdempotency(existing: { amount: Prisma.Decimal; reason: string | null; status: PaymentRefundStatus }, amount: Prisma.Decimal, reason?: string) {
    if (!existing.amount.eq(amount) || existing.reason !== (reason ?? null)) throw new ConflictException('Idempotency key was already used for a different refund');
    return existing;
  }

  private isUniqueViolation(error: unknown) { return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'; }
}
