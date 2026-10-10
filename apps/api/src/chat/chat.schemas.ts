import { z } from 'zod';

export const chatMessageSchema = z.object({ body: z.string().trim().min(1).max(5_000) }).strict();
export const chatReadSchema = z.object({ messageId: z.string().uuid() }).strict();

export type ChatMessageInput = z.infer<typeof chatMessageSchema>;
export type ChatReadInput = z.infer<typeof chatReadSchema>;
