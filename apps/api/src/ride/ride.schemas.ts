import { z } from 'zod';

const coordinate = (min: number, max: number) => z.number().finite().min(min).max(max);

export const rideCreateSchema = z.object({
  idempotencyKey: z.string().trim().min(8).max(100).optional(),
  pickupAddress: z.string().trim().min(1).max(500),
  pickupLatitude: coordinate(-90, 90),
  pickupLongitude: coordinate(-180, 180),
  pickupPlaceId: z.string().trim().min(1).max(200).optional().nullable(),
  destinationAddress: z.string().trim().min(1).max(500),
  destinationLatitude: coordinate(-90, 90),
  destinationLongitude: coordinate(-180, 180),
  destinationPlaceId: z.string().trim().min(1).max(200).optional().nullable(),
  scheduledAt: z.coerce.date().refine((date) => date.getTime() > Date.now(), 'Scheduled time must be in the future'),
  seatsRequested: z.number().int().min(1).max(100),
  estimatedFare: z.number().finite().nonnegative().max(1_000_000).optional().nullable(),
  currency: z.string().trim().length(3).toUpperCase().default('INR'),
}).strict().refine(
  (value) => value.pickupAddress.toLowerCase() !== value.destinationAddress.toLowerCase()
    || value.pickupLatitude !== value.destinationLatitude
    || value.pickupLongitude !== value.destinationLongitude,
  { message: 'Pickup and destination must be different', path: ['destinationAddress'] },
);

export const rideTransitionSchema = z.object({
  status: z.enum(['MATCHING', 'OFFERED', 'ACCEPTED', 'DRIVER_ARRIVING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'EXPIRED']),
  cancellationReason: z.string().trim().min(1).max(500).optional(),
}).strict();

export const rideAssignmentSchema = z.object({
  driverId: z.string().uuid(),
  vehicleId: z.string().uuid(),
}).strict();

export type RideCreateInput = z.infer<typeof rideCreateSchema>;
export type RideTransitionInput = z.infer<typeof rideTransitionSchema>;
export type RideAssignmentInput = z.infer<typeof rideAssignmentSchema>;
