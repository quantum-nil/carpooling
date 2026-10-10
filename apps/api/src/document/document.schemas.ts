import { DriverDocumentType, DocumentStatus, VehicleDocumentType } from '@prisma/client';
import { z } from 'zod';

export const uploadMetadataSchema = z.object({
  documentType: z.union([z.nativeEnum(DriverDocumentType), z.nativeEnum(VehicleDocumentType)]),
  fileName: z.string().trim().min(1).max(255).regex(/^[^\\/]+$/, 'File name must not contain path separators'),
  contentType: z.enum(['application/pdf', 'image/jpeg', 'image/png']),
  sizeBytes: z.number().int().positive().max(10 * 1024 * 1024),
  expiresAt: z.coerce.date().refine((date) => date > new Date(), 'Expiry date must be in the future').optional().nullable(),
}).strict();

export const verificationSchema = z.object({
  status: z.enum([DocumentStatus.VERIFIED, DocumentStatus.REJECTED]),
  rejectionReason: z.string().trim().min(1).max(1_000).optional(),
}).strict().refine((value) => value.status !== DocumentStatus.REJECTED || Boolean(value.rejectionReason), { message: 'Rejection reason is required when rejecting a document', path: ['rejectionReason'] });

export type UploadMetadataInput = z.infer<typeof uploadMetadataSchema>;
export type VerificationInput = z.infer<typeof verificationSchema>;
