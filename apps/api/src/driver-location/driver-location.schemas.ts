import { z } from 'zod';

export const driverLocationSchema = z.object({
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
}).strict();

export type DriverLocationInput = z.infer<typeof driverLocationSchema>;
