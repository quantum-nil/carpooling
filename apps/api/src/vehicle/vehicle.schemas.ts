import { z } from 'zod';

const metadataValue = z.union([z.string().max(500), z.number().finite(), z.boolean()]);

export const vehicleCreateSchema = z.object({
  registrationNumber: z.string().trim().min(1).max(30),
  capacity: z.number().int().min(1).max(100),
  make: z.string().trim().min(1).max(100).optional().nullable(),
  model: z.string().trim().min(1).max(100).optional().nullable(),
  metadata: z.record(metadataValue).optional().nullable(),
}).strict();

export const vehicleUpdateSchema = vehicleCreateSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  { message: 'At least one vehicle field is required' },
);

export const vehicleStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'INACTIVE', 'MAINTENANCE', 'RETIRED']),
}).strict();

export const vehicleAssignmentSchema = z.object({
  employeeId: z.string().uuid().nullable(),
}).strict();

export type VehicleCreateInput = z.infer<typeof vehicleCreateSchema>;
export type VehicleUpdateInput = z.infer<typeof vehicleUpdateSchema>;
export type VehicleStatusInput = z.infer<typeof vehicleStatusSchema>;
export type VehicleAssignmentInput = z.infer<typeof vehicleAssignmentSchema>;
