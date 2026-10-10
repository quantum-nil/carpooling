import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Worker } from 'bullmq';
import type { AppEnv } from '../config/env';
import { DRIVER_OFFER_EXPIRATION_QUEUE } from './offer-expiration-queue.service';
import { OfferLifecycleService } from './offer-lifecycle.service';

@Injectable()
export class OfferExpirationProcessor implements OnModuleInit, OnModuleDestroy {
  private worker?: Worker;

  constructor(
    private readonly lifecycle: OfferLifecycleService,
    private readonly config: ConfigService<AppEnv>,
  ) {}

  onModuleInit() {
    this.worker = new Worker(
      DRIVER_OFFER_EXPIRATION_QUEUE,
      async (job) => this.lifecycle.expireOffer(job.data.offerId),
      { connection: { url: this.config.getOrThrow('REDIS_URL') } },
    );
  }

  async onModuleDestroy() {
    await this.worker?.close();
  }
}
