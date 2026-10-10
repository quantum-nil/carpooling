import { z } from 'zod';

const coordinate = (min: number, max: number) => z.number().finite().min(min).max(max);
const dateOnly = z.coerce.date();

export const recurringRideCreateSchema = z.object({
  pickupAddress: z.string().trim().min(1).max(500),
  pickupLatitude: coordinate(-90, 90),
  pickupLongitude: coordinate(-180, 180),
  pickupPlaceId: z.string().trim().min(1).max(200).optional().nullable(),
  destinationAddress: z.string().trim().min(1).max(500),
  destinationLatitude: coordinate(-90, 90),
  destinationLongitude: coordinate(-180, 180),
  destinationPlaceId: z.string().trim().min(1).max(200).optional().nullable(),
  scheduledTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Scheduled time must use HH:mm'),
  timeZone: z.string().trim().min(1).max(100).default('UTC'),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).min(1).max(7).refine((days) => new Set(days).size === days.length, 'Days of week must be unique'),
  startDate: dateOnly,
  endDate: dateOnly,
  seatsRequested: z.number().int().min(1).max(100),
  estimatedFare: z.number().finite().nonnegative().max(1_000_000).optional().nullable(),
  currency: z.string().trim().length(3).toUpperCase().default('INR'),
}).strict().refine((value) => value.endDate >= value.startDate, { message: 'End date must be on or after start date', path: ['endDate'] }).refine(
  (value) => value.pickupAddress.toLowerCase() !== value.destinationAddress.toLowerCase()
    || value.pickupLatitude !== value.destinationLatitude
    || value.pickupLongitude !== value.destinationLongitude,
  { message: 'Pickup and destination must be different', path: ['destinationAddress'] },
);

export const recurringRideCancelSchema = z.object({ reason: z.string().trim().min(1).max(500) }).strict();

export type RecurringRideCreateInput = z.infer<typeof recurringRideCreateSchema>;
export type RecurringRideCancelInput = z.infer<typeof recurringRideCancelSchema>;
