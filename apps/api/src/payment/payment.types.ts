import type { PaymentStatus, PaymentRefundStatus } from '@prisma/client';

export interface CreateProviderOrderInput {
  amountMinor: number;
  currency: string;
  receipt: string;
  notes?: Record<string, string>;
}

export interface ProviderOrder {
  id: string;
  amountMinor: number;
  currency: string;
  status?: string;
}

export interface VerifyProviderPaymentInput {
  orderId: string;
  paymentId: string;
  signature: string;
}

export interface CreateProviderRefundInput {
  paymentId: string;
  amountMinor: number;
  notes?: Record<string, string>;
}

export interface ProviderRefund {
  id: string;
  status?: string;
}

export type PaymentWebhook =
  | { providerEventId: string; eventType: string; kind: 'PAYMENT_CAPTURED'; orderId: string; paymentId: string; amountMinor: number; currency: string; payload: Record<string, unknown> }
  | { providerEventId: string; eventType: string; kind: 'PAYMENT_FAILED'; orderId: string; paymentId?: string; errorCode?: string; errorMessage?: string; payload: Record<string, unknown> }
  | { providerEventId: string; eventType: string; kind: 'REFUND_PROCESSED' | 'REFUND_FAILED'; paymentId: string; refundId: string; errorMessage?: string; payload: Record<string, unknown> };

export interface PaymentProvider {
  createOrder(input: CreateProviderOrderInput): Promise<ProviderOrder>;
  verifyPayment(input: VerifyProviderPaymentInput): Promise<void>;
  createRefund(input: CreateProviderRefundInput): Promise<ProviderRefund>;
  verifyWebhook(rawBody: Buffer, signature: string): void;
  parseWebhook(rawBody: Buffer, providerEventId: string): PaymentWebhook;
}

export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');

export const allowedPaymentTransitions: Record<PaymentStatus, readonly PaymentStatus[]> = {
  CREATED: ['AUTHORIZED', 'CAPTURED', 'FAILED'],
  AUTHORIZED: ['CAPTURED', 'FAILED', 'PARTIALLY_REFUNDED', 'REFUNDED'],
  CAPTURED: ['PARTIALLY_REFUNDED', 'REFUNDED'],
  FAILED: ['AUTHORIZED', 'CAPTURED'],
  PARTIALLY_REFUNDED: ['REFUNDED'],
  REFUNDED: [],
};

export const allowedRefundTransitions: Record<PaymentRefundStatus, readonly PaymentRefundStatus[]> = {
  REQUESTED: ['PROCESSING', 'FAILED'],
  PROCESSING: ['COMPLETED', 'FAILED'],
  COMPLETED: [],
  FAILED: ['REQUESTED', 'PROCESSING'],
};
