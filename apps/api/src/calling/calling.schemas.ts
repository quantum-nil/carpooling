import { z } from 'zod';

export const initiateCallSchema = z.object({
  targetUserId: z.string().uuid(),
  idempotencyKey: z.string().trim().min(8).max(100),
}).strict();

export type InitiateCallInput = z.infer<typeof initiateCallSchema>;
