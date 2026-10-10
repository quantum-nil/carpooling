import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { AppEnv } from '../config/env';
import type { CreateProviderOrderInput, CreateProviderRefundInput, PaymentProvider, PaymentWebhook, ProviderOrder, ProviderRefund, VerifyProviderPaymentInput } from './payment.types';

@Injectable()
export class RazorpayProvider implements PaymentProvider {
  private readonly baseUrl = 'https://api.razorpay.com/v1';

  constructor(private readonly config: ConfigService<AppEnv>) {}

  async createOrder(input: CreateProviderOrderInput): Promise<ProviderOrder> {
    const result = await this.request<{ id: string; amount: number; currency: string; status?: string }>('/orders', {
      method: 'POST', body: JSON.stringify({ amount: input.amountMinor, currency: input.currency, receipt: input.receipt, notes: input.notes ?? {} }),
    });
    return { id: result.id, amountMinor: result.amount, currency: result.currency, status: result.status };
  }

  async verifyPayment(input: VerifyProviderPaymentInput) {
    this.verifyHmac(`${input.orderId}|${input.paymentId}`, input.signature, this.config.getOrThrow('RAZORPAY_KEY_SECRET'));
  }

  async createRefund(input: CreateProviderRefundInput): Promise<ProviderRefund> {
    const result = await this.request<{ id: string; status?: string }>(`/payments/${encodeURIComponent(input.paymentId)}/refund`, {
      method: 'POST', body: JSON.stringify({ amount: input.amountMinor, notes: input.notes ?? {} }),
    });
    return { id: result.id, status: result.status };
  }

  verifyWebhook(rawBody: Buffer, signature: string) {
    this.verifyHmac(rawBody.toString('utf8'), signature, this.config.getOrThrow('RAZORPAY_WEBHOOK_SECRET'));
  }

  parseWebhook(rawBody: Buffer, providerEventId: string): PaymentWebhook {
    const payload = JSON.parse(rawBody.toString('utf8')) as Record<string, any>;
    const entity = payload.payload?.payment?.entity ?? payload.payload?.refund?.entity;
    if (!providerEventId || !entity) throw new Error('Invalid Razorpay webhook payload');
    const eventType = String(payload.event ?? '');
    const common = { providerEventId, eventType, payload };
    if (eventType === 'payment.captured') return { ...common, kind: 'PAYMENT_CAPTURED', orderId: String(entity.order_id), paymentId: String(entity.id), amountMinor: Number(entity.amount), currency: String(entity.currency) };
    if (eventType === 'payment.failed') return { ...common, kind: 'PAYMENT_FAILED', orderId: String(entity.order_id), paymentId: entity.id ? String(entity.id) : undefined, errorCode: entity.error_code ? String(entity.error_code) : undefined, errorMessage: entity.error_description ? String(entity.error_description) : undefined };
    if (eventType === 'refund.processed') return { ...common, kind: 'REFUND_PROCESSED', paymentId: String(entity.payment_id), refundId: String(entity.id) };
    if (eventType === 'refund.failed') return { ...common, kind: 'REFUND_FAILED', paymentId: String(entity.payment_id), refundId: String(entity.id), errorMessage: entity.failure_reason ? String(entity.failure_reason) : undefined };
    throw new Error(`Unsupported Razorpay webhook event: ${eventType}`);
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    const keyId = this.config.getOrThrow('RAZORPAY_KEY_ID');
    const secret = this.config.getOrThrow('RAZORPAY_KEY_SECRET');
    const response = await fetch(`${this.baseUrl}${path}`, { ...init, headers: { Authorization: `Basic ${Buffer.from(`${keyId}:${secret}`).toString('base64')}`, 'Content-Type': 'application/json' } });
    if (!response.ok) throw new Error(`Razorpay returned HTTP ${response.status}`);
    return response.json() as Promise<T>;
  }

  private verifyHmac(value: string, signature: string, secret: string) {
    const expected = createHmac('sha256', secret).update(value).digest('hex');
    const expectedBuffer = Buffer.from(expected, 'utf8');
    const actualBuffer = Buffer.from(signature, 'utf8');
    if (expectedBuffer.length !== actualBuffer.length || !timingSafeEqual(expectedBuffer, actualBuffer)) throw new Error('Invalid payment signature');
  }
}
