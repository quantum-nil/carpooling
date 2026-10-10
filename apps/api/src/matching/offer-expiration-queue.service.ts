import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import type { AppEnv } from '../config/env';

export const DRIVER_OFFER_EXPIRATION_QUEUE = 'driver-offer-expiration';

@Injectable()
export class OfferExpirationQueueService implements OnModuleDestroy {
  private readonly queue: Queue;

  constructor(config: ConfigService<AppEnv>) {
    this.queue = new Queue(DRIVER_OFFER_EXPIRATION_QUEUE, { connection: { url: config.getOrThrow('REDIS_URL') } });
  }

  async schedule(offerId: string, expiresAt: Date) {
    const delay = Math.max(0, expiresAt.getTime() - Date.now());
    await this.queue.add('expire-offer', { offerId }, { delay, jobId: `offer-expiration:${offerId}`, removeOnComplete: true, removeOnFail: 100 });
  }

  async onModuleDestroy() {
    await this.queue.close();
  }
}
