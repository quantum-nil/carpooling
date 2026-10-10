import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Worker } from 'bullmq';
import type { AppEnv } from '../config/env';
import { NOTIFICATION_DELIVERY_QUEUE } from './notification-queue.service';
import { NotificationService } from './notification.service';

@Injectable()
export class NotificationProcessor implements OnModuleInit, OnModuleDestroy {
  private worker?: Worker;

  constructor(private readonly notifications: NotificationService, private readonly config: ConfigService<AppEnv>) {}

  onModuleInit() {
    this.worker = new Worker(NOTIFICATION_DELIVERY_QUEUE, async (job) => this.notifications.deliver(job.data.deliveryId), { connection: { url: this.config.getOrThrow('REDIS_URL') } });
  }

  async onModuleDestroy() { await this.worker?.close(); }
}
