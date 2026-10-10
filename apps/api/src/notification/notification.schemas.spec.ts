import { NotificationChannel, NotificationType } from '@prisma/client';
import { preferenceSchema, deviceSchema } from './notification.schemas';

describe('notification schemas', () => {
  it('rejects disabling in-app notifications', () => {
    expect(preferenceSchema.safeParse({ type: NotificationType.RIDE_UPDATE, channel: NotificationChannel.IN_APP, enabled: false }).success).toBe(false);
  });

  it('rejects short device tokens', () => {
    expect(deviceSchema.safeParse({ token: 'short', platform: 'ANDROID' }).success).toBe(false);
  });
});
