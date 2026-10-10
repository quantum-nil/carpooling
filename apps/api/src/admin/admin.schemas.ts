import { z } from 'zod';

export const adminListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().trim().max(200).optional(),
  status: z.string().trim().max(50).optional(),
  actorUserId: z.string().uuid().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
}).strict();

export type AdminListQuery = z.infer<typeof adminListQuerySchema>;

export const analyticsQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
}).strict().refine((value) => !value.from || !value.to || value.from <= value.to, { message: 'Analytics from must be before to', path: ['to'] });

export type AnalyticsQuery = z.infer<typeof analyticsQuerySchema>;

const adminPassword = z.string().min(12).max(128);

export const adminUserCreateSchema = z.object({
  email: z.string().trim().email().max(254),
  password: adminPassword,
  displayName: z.string().trim().min(1).max(100).optional().nullable(),
  phoneNumber: z.string().trim().regex(/^\+?[1-9]\d{7,14}$/, 'Enter a valid phone number').optional().nullable(),
  role: z.enum(['ADMIN', 'CUSTOMER']),
}).strict();

export const adminUserUpdateSchema = z.object({
  displayName: z.string().trim().min(1).max(100).optional().nullable(),
  phoneNumber: z.string().trim().regex(/^\+?[1-9]\d{7,14}$/, 'Enter a valid phone number').optional().nullable(),
}).strict().refine((value) => Object.keys(value).length > 0, { message: 'At least one field is required' });

export const adminUserStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'SUSPENDED', 'DELETED']),
}).strict();

export type AdminUserCreateInput = z.infer<typeof adminUserCreateSchema>;
export type AdminUserUpdateInput = z.infer<typeof adminUserUpdateSchema>;
export type AdminUserStatusInput = z.infer<typeof adminUserStatusSchema>;
