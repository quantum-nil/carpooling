import { z } from 'zod';

export const assistantRequestSchema = z.object({
  message: z.string().trim().min(1).max(4000),
}).strict();

export const rideIntentSchema = z.object({
  pickup: z.string().trim().min(1).max(500).nullable(),
  destination: z.string().trim().min(1).max(500).nullable(),
  scheduledAt: z.string().datetime({ offset: true }).nullable(),
  preferences: z.array(z.string().trim().min(1).max(200)).max(20),
  seatsRequested: z.number().int().min(1).max(100).nullable(),
}).strict();

export const recommendationSchema = z.object({
  summary: z.string().trim().min(1).max(2000),
  recommendations: z.array(z.object({
    rideId: z.string().uuid(),
    explanation: z.string().trim().min(1).max(500),
  }).strict()).max(20),
}).strict();

export type AssistantRequestInput = z.infer<typeof assistantRequestSchema>;
export type RideIntent = z.infer<typeof rideIntentSchema>;
export type Recommendation = z.infer<typeof recommendationSchema>;
