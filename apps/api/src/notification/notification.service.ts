import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { NotificationChannel, NotificationDeliveryStatus, NotificationDevicePlatform, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationQueueService } from './notification-queue.service';
import { EMAIL_NOTIFICATION_PROVIDER, PUSH_NOTIFICATION_PROVIDER, type EmailNotificationProvider, type PushNotificationProvider, type NotificationMessage } from './notification.types';
import type { DeviceInput, PreferenceInput } from './notification.schemas';

@Injectable()
export class NotificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: NotificationQueueService,
    @Inject(EMAIL_NOTIFICATION_PROVIDER) private readonly email: EmailNotificationProvider,
    @Inject(PUSH_NOTIFICATION_PROVIDER) private readonly push: PushNotificationProvider,
  ) {}

  async create(input: NotificationMessage) {
    const requestedChannels = Array.from(new Set(input.channels ?? [NotificationChannel.IN_APP]));
    const preferences = await this.prisma.notificationPreference.findMany({ where: { userId: input.userId, type: input.type, channel: { in: requestedChannels }, enabled: false } });
    const disabled = new Set(preferences.map((preference) => preference.channel));
    const channels = requestedChannels.filter((channel) => !disabled.has(channel));
    const notification = await this.prisma.$transaction(async (transaction) => transaction.notification.create({
      data: {
        userId: input.userId,
        type: input.type,
        title: input.title,
        body: input.body,
        data: input.data as Prisma.InputJsonValue | undefined,
        deliveries: { create: channels.map((channel) => ({ channel })) },
      },
      include: { deliveries: true },
    }));
    await Promise.all(notification.deliveries.filter(({ channel }) => channel !== NotificationChannel.IN_APP).map(({ id }) => this.queue.enqueue(id)));
    return notification;
  }

  listForUser(userId: string, unreadOnly = false) {
    return this.prisma.notification.findMany({ where: { userId, ...(unreadOnly ? { readAt: null } : {}) }, include: { deliveries: { select: { channel: true, status: true, sentAt: true } } }, orderBy: { createdAt: 'desc' }, take: 100 });
  }

  async markRead(userId: string, notificationId: string) {
    const result = await this.prisma.notification.updateMany({ where: { id: notificationId, userId, readAt: null }, data: { readAt: new Date() } });
    if (result.count === 0) throw new NotFoundException('Notification not found');
    return this.prisma.notification.findUniqueOrThrow({ where: { id: notificationId }, include: { deliveries: { select: { channel: true, status: true, sentAt: true } } } });
  }

  getPreferences(userId: string) { return this.prisma.notificationPreference.findMany({ where: { userId }, orderBy: [{ type: 'asc' }, { channel: 'asc' }] }); }

  setPreference(userId: string, input: PreferenceInput) {
    return this.prisma.notificationPreference.upsert({ where: { userId_type_channel: { userId, type: input.type, channel: input.channel } }, update: { enabled: input.enabled }, create: { userId, type: input.type, channel: input.channel, enabled: input.enabled } });
  }

  registerDevice(userId: string, input: DeviceInput) {
    return this.prisma.notificationDevice.upsert({ where: { token: input.token }, update: { userId, platform: input.platform, active: true, lastSeenAt: new Date() }, create: { userId, token: input.token, platform: input.platform } });
  }

  unregisterDevice(userId: string, token: string) { return this.prisma.notificationDevice.updateMany({ where: { userId, token }, data: { active: false } }); }

  async deliver(deliveryId: string) {
    const delivery = await this.prisma.notificationDelivery.findUnique({ where: { id: deliveryId }, include: { notification: { include: { user: { select: { email: true, notificationDevices: { where: { active: true } } } } } } } });
    if (!delivery || delivery.status === NotificationDeliveryStatus.SENT) return;
    const claim = await this.prisma.notificationDelivery.updateMany({ where: { id: deliveryId, status: { in: [NotificationDeliveryStatus.PENDING, NotificationDeliveryStatus.FAILED] } }, data: { status: NotificationDeliveryStatus.PROCESSING, attempts: { increment: 1 } } });
    if (claim.count === 0) return;
    try {
      const result = delivery.channel === NotificationChannel.EMAIL
        ? await this.email.send({ to: delivery.notification.user.email, subject: delivery.notification.title, text: delivery.notification.body, data: this.jsonData(delivery.notification.data) })
        : await this.deliverPush(delivery);
      await this.prisma.notificationDelivery.update({ where: { id: deliveryId }, data: { status: NotificationDeliveryStatus.SENT, providerMessageId: result.providerMessageId, sentAt: new Date(), lastError: null } });
    } catch (error) {
      await this.prisma.notificationDelivery.update({ where: { id: deliveryId }, data: { status: NotificationDeliveryStatus.FAILED, lastError: error instanceof Error ? error.message : 'Notification provider failed' } });
      throw error;
    }
  }

  private async deliverPush(delivery: { notification: { title: string; body: string; data: Prisma.JsonValue | null; user: { notificationDevices: { token: string; platform: NotificationDevicePlatform }[] } } }) {
    const devices = delivery.notification.user.notificationDevices;
    if (devices.length === 0) return {};
    return this.push.send({ tokens: devices.map(({ token }) => token), title: delivery.notification.title, body: delivery.notification.body, data: this.stringData(delivery.notification.data), platforms: devices.map(({ platform }) => platform) });
  }

  private jsonData(value: Prisma.JsonValue | null) { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined; }
  private stringData(value: Prisma.JsonValue | null) { const data = this.jsonData(value); return data ? Object.fromEntries(Object.entries(data).map(([key, item]) => [key, String(item)])) : undefined; }
}
