import { RatingReportStatus } from '@prisma/client';
import { z } from 'zod';

export const createRatingSchema = z.object({
  ratedUserId: z.string().uuid(),
  score: z.number().int().min(1).max(5),
  reviewText: z.string().trim().max(2_000).optional().nullable(),
}).strict();

export const reportRatingSchema = z.object({
  reason: z.string().trim().min(1).max(1_000),
}).strict();

export const reviewReportSchema = z.object({
  status: z.nativeEnum(RatingReportStatus),
}).strict();

export type CreateRatingInput = z.infer<typeof createRatingSchema>;
export type ReportRatingInput = z.infer<typeof reportRatingSchema>;
export type ReviewReportInput = z.infer<typeof reviewReportSchema>;
