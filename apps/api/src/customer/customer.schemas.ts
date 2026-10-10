import { z } from 'zod';

const settingValue = z.union([z.string().max(200), z.number().finite(), z.boolean()]);

export const customerProfileUpdateSchema = z.object({
  displayName: z.string().trim().min(1).max(100).optional().nullable(),
  phoneNumber: z.string().trim().regex(/^\+?[1-9]\d{7,14}$/, 'Enter a valid phone number').optional().nullable(),
  preferredSettings: z.record(settingValue).optional().nullable(),
}).strict().refine((value) => Object.keys(value).length > 0, { message: 'At least one field is required' });

export const customerStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'INACTIVE']),
}).strict();

export const savedLocationCreateSchema = z.object({
  label: z.string().trim().min(1).max(50),
  address: z.string().trim().min(1).max(500),
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
  placeId: z.string().trim().min(1).max(200).optional().nullable(),
}).strict();

export const savedLocationUpdateSchema = savedLocationCreateSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  { message: 'At least one location field is required' },
);

export type CustomerProfileUpdateInput = z.infer<typeof customerProfileUpdateSchema>;
export type CustomerStatusInput = z.infer<typeof customerStatusSchema>;
export type SavedLocationCreateInput = z.infer<typeof savedLocationCreateSchema>;
export type SavedLocationUpdateInput = z.infer<typeof savedLocationUpdateSchema>;
