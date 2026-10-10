import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import type { AppEnv } from '../config/env';

export const NOTIFICATION_DELIVERY_QUEUE = 'notification-delivery';

@Injectable()
export class NotificationQueueService implements OnModuleDestroy {
  private readonly queue: Queue;

  constructor(config: ConfigService<AppEnv>) {
    this.queue = new Queue(NOTIFICATION_DELIVERY_QUEUE, { connection: { url: config.getOrThrow('REDIS_URL') } });
  }

  async enqueue(deliveryId: string) {
    await this.queue.add('deliver-notification', { deliveryId }, { jobId: `notification-delivery:${deliveryId}`, attempts: 5, backoff: { type: 'exponential', delay: 5_000 }, removeOnComplete: true, removeOnFail: 100 });
  }

  async onModuleDestroy() { await this.queue.close(); }
}
