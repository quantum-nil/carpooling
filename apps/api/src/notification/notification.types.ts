import type { NotificationChannel, NotificationDevicePlatform, NotificationType } from '@prisma/client';

export interface NotificationMessage {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  channels?: NotificationChannel[];
}

export interface EmailNotificationInput {
  to: string;
  subject: string;
  text: string;
  data?: Record<string, unknown>;
}

export interface PushNotificationInput {
  tokens: string[];
  title: string;
  body: string;
  data?: Record<string, string>;
  platforms?: NotificationDevicePlatform[];
}

export interface ProviderDeliveryResult {
  providerMessageId?: string;
}

export interface EmailNotificationProvider {
  send(input: EmailNotificationInput): Promise<ProviderDeliveryResult>;
}

export interface PushNotificationProvider {
  send(input: PushNotificationInput): Promise<ProviderDeliveryResult>;
}

export const EMAIL_NOTIFICATION_PROVIDER = Symbol('EMAIL_NOTIFICATION_PROVIDER');
export const PUSH_NOTIFICATION_PROVIDER = Symbol('PUSH_NOTIFICATION_PROVIDER');
