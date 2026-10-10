import { z } from 'zod';

const money = z.number().finite().positive().refine((value) => Number.isInteger(value * 100), 'Amount must have at most two decimal places');
const identifier = z.string().trim().min(1).max(200);

export const walletMutationSchema = z.object({
  amount: money,
  idempotencyKey: identifier,
  referenceId: identifier,
  metadata: z.record(z.unknown()).optional(),
}).strict();

export const walletRefundSchema = walletMutationSchema.extend({
  originalTransactionId: z.string().uuid(),
}).strict();

export type WalletMutationInput = z.infer<typeof walletMutationSchema>;
export type WalletRefundInput = z.infer<typeof walletRefundSchema>;
