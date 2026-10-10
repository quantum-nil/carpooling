import { z } from 'zod';

const email = z.string().trim().email().max(254);
const password = z.string().min(12).max(128);

export const employeeCreateSchema = z.object({
  email,
  password,
  employeeCode: z.string().trim().min(1).max(50),
  displayName: z.string().trim().min(1).max(100).optional(),
  phoneNumber: z.string().trim().regex(/^\+?[1-9]\d{7,14}$/, 'Enter a valid phone number').optional(),
}).strict();

export const employeeStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'INACTIVE']),
}).strict();

export const driverStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'INACTIVE']),
}).strict();

export const driverReviewSchema = z.object({
  decision: z.enum(['APPROVE', 'REJECT']),
  note: z.string().trim().max(500).optional(),
}).strict().superRefine((value, context) => {
  if (value.decision === 'REJECT' && !value.note) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['note'], message: 'A rejection reason is required' });
  }
});

export const availabilitySchema = z.object({
  availability: z.enum(['AVAILABLE', 'UNAVAILABLE', 'OFFLINE']),
}).strict();

export const driverDocumentCreateSchema = z.object({
  documentType: z.enum(['DRIVING_LICENSE', 'IDENTITY', 'MEDICAL_CERTIFICATE', 'OTHER']),
  storageKey: z.string().trim().min(1).max(500),
  expiresAt: z.coerce.date().optional().nullable(),
}).strict();

export const driverDocumentStatusSchema = z.object({
  status: z.enum(['PENDING', 'VERIFIED', 'REJECTED', 'EXPIRED']),
}).strict();

export type EmployeeCreateInput = z.infer<typeof employeeCreateSchema>;
export type EmployeeStatusInput = z.infer<typeof employeeStatusSchema>;
export type DriverStatusInput = z.infer<typeof driverStatusSchema>;
export type DriverReviewInput = z.infer<typeof driverReviewSchema>;
export type AvailabilityInput = z.infer<typeof availabilitySchema>;
export type DriverDocumentCreateInput = z.infer<typeof driverDocumentCreateSchema>;
export type DriverDocumentStatusInput = z.infer<typeof driverDocumentStatusSchema>;
