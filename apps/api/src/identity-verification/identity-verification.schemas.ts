import { IdentityVerificationStatus } from '@prisma/client';
import { z } from 'zod';

export const reviewIdentityVerificationSchema = z.object({
  status: z.enum([IdentityVerificationStatus.VERIFIED, IdentityVerificationStatus.REJECTED]),
  rejectionReason: z.string().trim().min(1).max(1_000).optional(),
}).strict().refine((value) => value.status !== IdentityVerificationStatus.REJECTED || Boolean(value.rejectionReason), { message: 'Rejection reason is required', path: ['rejectionReason'] });

export type ReviewIdentityVerificationInput = z.infer<typeof reviewIdentityVerificationSchema>;
