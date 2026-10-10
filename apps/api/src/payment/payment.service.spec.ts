import { PaymentRefundStatus, PaymentStatus, PaymentWebhookStatus, Prisma } from '@prisma/client';
import { UnauthorizedException } from '@nestjs/common';
import { PaymentService } from './payment.service';

const userId = '00000000-0000-0000-0000-000000000001';
const paymentId = '00000000-0000-0000-0000-000000000002';
const payment = { id: paymentId, userId, providerOrderId: 'order_1', providerPaymentId: 'pay_1', amount: new Prisma.Decimal(100), currency: 'INR', status: PaymentStatus.CREATED };

function provider() {
  return {
    createOrder: jest.fn().mockResolvedValue({ id: 'order_1', amountMinor: 10_000, currency: 'INR' }),
    verifyPayment: jest.fn().mockResolvedValue(undefined),
    createRefund: jest.fn().mockResolvedValue({ id: 'rfnd_1' }),
    verifyWebhook: jest.fn(),
    parseWebhook: jest.fn().mockReturnValue({ providerEventId: 'evt_1', eventType: 'payment.captured', kind: 'PAYMENT_CAPTURED', orderId: 'order_1', paymentId: 'pay_1', amountMinor: 10_000, currency: 'INR', payload: {} }),
  };
}

describe('PaymentService', () => {
  it('creates a provider order and stores its provider ID', async () => {
    const razorpay = provider();
    const prisma = { payment: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ ...payment, status: PaymentStatus.CREATED }), update: jest.fn().mockResolvedValue({ ...payment, providerOrderId: 'order_1' }) } };
    const service = new PaymentService(prisma as never, razorpay as never);

    const result = await service.createOrder(userId, { amount: 100, currency: 'INR', referenceId: 'ride_1', idempotencyKey: 'payment_1' });

    expect(razorpay.createOrder).toHaveBeenCalledWith(expect.objectContaining({ amountMinor: 10_000 }));
    expect(result.providerOrderId).toBe('order_1');
  });

  it('marks provider order failures as failed', async () => {
    const razorpay = provider();
    razorpay.createOrder.mockRejectedValue(new Error('provider unavailable'));
    const failed = { ...payment, status: PaymentStatus.FAILED, failureMessage: 'provider unavailable' };
    const prisma = { payment: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue(payment), update: jest.fn().mockResolvedValue(failed) } };
    const service = new PaymentService(prisma as never, razorpay as never);

    const result = await service.createOrder(userId, { amount: 100, currency: 'INR', referenceId: 'ride_1', idempotencyKey: 'payment_1' });

    expect(result.status).toBe(PaymentStatus.FAILED);
  });

  it('rejects an invalid payment signature before changing state', async () => {
    const razorpay = provider();
    razorpay.verifyPayment.mockRejectedValue(new Error('invalid signature'));
    const prisma = { payment: { findUnique: jest.fn().mockResolvedValue(payment) } };
    const service = new PaymentService(prisma as never, razorpay as never);

    await expect(service.verifyPayment(userId, paymentId, { orderId: 'order_1', paymentId: 'pay_1', signature: 'invalid-signature' })).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('processes a capture webhook only once when the provider retries it', async () => {
    const razorpay = provider();
    const tx = {
      paymentWebhookEvent: { findUnique: jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce({ status: PaymentWebhookStatus.PROCESSED }), create: jest.fn(), update: jest.fn() },
      payment: { findUnique: jest.fn().mockResolvedValue(payment), update: jest.fn() },
      $queryRaw: jest.fn(),
    };
    const prisma = { $transaction: jest.fn((callback: (transaction: typeof tx) => unknown) => callback(tx)) };
    const service = new PaymentService(prisma as never, razorpay as never);

    const first = await service.processWebhook(Buffer.from('{}'), 'valid', 'evt_1');
    const second = await service.processWebhook(Buffer.from('{}'), 'valid', 'evt_1');

    expect(first).toEqual({ duplicate: false, status: PaymentWebhookStatus.PROCESSED });
    expect(second).toEqual({ duplicate: true, status: PaymentWebhookStatus.PROCESSED });
    expect(tx.payment.update).toHaveBeenCalledTimes(1);
  });

  it('rejects a webhook with an invalid signature before opening a database transaction', async () => {
    const razorpay = provider();
    razorpay.verifyWebhook.mockImplementation(() => { throw new Error('invalid webhook signature'); });
    const prisma = { $transaction: jest.fn() };
    const service = new PaymentService(prisma as never, razorpay as never);

    await expect(service.processWebhook(Buffer.from('{}'), 'invalid', 'evt_invalid')).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('accepts a delayed capture webhook after payment creation', async () => {
    const razorpay = provider();
    const tx = {
      paymentWebhookEvent: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn(), update: jest.fn() },
      payment: { findUnique: jest.fn().mockResolvedValue(payment), update: jest.fn() },
      $queryRaw: jest.fn(),
    };
    const prisma = { $transaction: jest.fn((callback: (transaction: typeof tx) => unknown) => callback(tx)) };
    const service = new PaymentService(prisma as never, razorpay as never);

    await service.processWebhook(Buffer.from('{}'), 'valid', 'evt_delayed');

    expect(tx.payment.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: PaymentStatus.CAPTURED }) }));
  });

  it('creates a refund and marks it completed', async () => {
    const razorpay = provider();
    const refundable = { ...payment, status: PaymentStatus.CAPTURED };
    const refund = { id: 'refund_1', paymentId, amount: new Prisma.Decimal(100), status: PaymentRefundStatus.PROCESSING, currency: 'INR' };
    const tx = { payment: { findUnique: jest.fn().mockResolvedValue(refundable), update: jest.fn() }, paymentRefund: { findUnique: jest.fn().mockResolvedValue(null), aggregate: jest.fn().mockResolvedValue({ _sum: { amount: null } }), create: jest.fn().mockResolvedValue(refund), update: jest.fn().mockResolvedValue({ ...refund, status: PaymentRefundStatus.COMPLETED }) }, $queryRaw: jest.fn() };
    const prisma = { payment: { findUnique: jest.fn().mockResolvedValue(refundable) }, $transaction: jest.fn((callback: (transaction: typeof tx) => unknown) => callback(tx)) };
    const service = new PaymentService(prisma as never, razorpay as never);

    const result = await service.refund(userId, paymentId, { amount: 100, idempotencyKey: 'refund_1', reason: 'Cancelled' });

    expect(razorpay.createRefund).toHaveBeenCalledWith(expect.objectContaining({ amountMinor: 10_000, paymentId: 'pay_1' }));
    expect(result.status).toBe(PaymentRefundStatus.COMPLETED);
  });

  it('returns the existing order for a retry after the browser closes', async () => {
    const razorpay = provider();
    const existing = { ...payment, status: PaymentStatus.CREATED, referenceId: 'ride_1' };
    const prisma = { payment: { findUnique: jest.fn().mockResolvedValue(existing), create: jest.fn(), update: jest.fn() } };
    const service = new PaymentService(prisma as never, razorpay as never);

    const result = await service.createOrder(userId, { amount: 100, currency: 'INR', referenceId: 'ride_1', idempotencyKey: 'payment_1' });

    expect(result).toBe(existing);
    expect(prisma.payment.create).not.toHaveBeenCalled();
    expect(razorpay.createOrder).not.toHaveBeenCalled();
  });
});
