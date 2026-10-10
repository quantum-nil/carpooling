import { z } from 'zod';

const amount = z.number().finite().positive().refine((value) => Number.isInteger(value * 100), 'Amount must have at most two decimal places');
const text = z.string().trim().min(1).max(200);

export const createPaymentSchema = z.object({
  amount,
  currency: z.string().trim().length(3).toUpperCase().default('INR'),
  referenceId: text,
  idempotencyKey: text,
  metadata: z.record(z.unknown()).optional(),
}).strict();

export const verifyPaymentSchema = z.object({
  orderId: text,
  paymentId: text,
  signature: z.string().trim().min(32).max(256),
}).strict();

export const refundSchema = z.object({
  amount: amount.optional(),
  idempotencyKey: text,
  reason: z.string().trim().max(500).optional(),
}).strict();

export type CreatePaymentInput = z.infer<typeof createPaymentSchema>;
export type VerifyPaymentInput = z.infer<typeof verifyPaymentSchema>;
export type RefundInput = z.infer<typeof refundSchema>;
