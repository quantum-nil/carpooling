import { NotificationChannel, NotificationDevicePlatform, NotificationType } from '@prisma/client';
import { z } from 'zod';

export const preferenceSchema = z.object({
  type: z.nativeEnum(NotificationType),
  channel: z.nativeEnum(NotificationChannel).refine((channel) => channel !== NotificationChannel.IN_APP, 'In-app notifications cannot be disabled'),
  enabled: z.boolean(),
}).strict();

export const deviceSchema = z.object({
  token: z.string().min(20).max(4096),
  platform: z.nativeEnum(NotificationDevicePlatform),
}).strict();

export type PreferenceInput = z.infer<typeof preferenceSchema>;
export type DeviceInput = z.infer<typeof deviceSchema>;
