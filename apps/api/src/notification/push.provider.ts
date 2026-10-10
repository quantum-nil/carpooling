import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppEnv } from '../config/env';
import type { ProviderDeliveryResult, PushNotificationInput, PushNotificationProvider } from './notification.types';

@Injectable()
export class FirebasePushProvider implements PushNotificationProvider {
  constructor(private readonly config: ConfigService<AppEnv>) {}

  async send(input: PushNotificationInput): Promise<ProviderDeliveryResult> {
    const serverKey = this.config.get('FCM_SERVER_KEY');
    if (!serverKey) throw new Error('Push provider is not configured');
    const response = await fetch('https://fcm.googleapis.com/fcm/send', {
      method: 'POST',
      headers: { Authorization: `key=${serverKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ registration_ids: input.tokens, notification: { title: input.title, body: input.body }, data: input.data ?? {} }),
    });
    if (!response.ok) throw new Error(`Push provider returned HTTP ${response.status}`);
    const result = await response.json() as { multicast_id?: number };
    return { providerMessageId: result.multicast_id?.toString() };
  }
}
