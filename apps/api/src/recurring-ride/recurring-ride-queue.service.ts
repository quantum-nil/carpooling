import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import type { AppEnv } from '../config/env';

export const RECURRING_RIDE_QUEUE = 'recurring-ride-generation';

@Injectable()
export class RecurringRideQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly queue: Queue;

  constructor(private readonly config: ConfigService<AppEnv>) { this.queue = new Queue(RECURRING_RIDE_QUEUE, { connection: { url: config.getOrThrow('REDIS_URL') } }); }

  async onModuleInit() {
    await this.queue.add('scan-recurring-rides', {}, { jobId: 'recurring-rides-hourly', repeat: { pattern: '0 * * * *' }, removeOnComplete: true, removeOnFail: 100 });
  }

  async schedule(recurringRideId: string) {
    await this.queue.add('generate-recurring-ride', { recurringRideId }, { jobId: `recurring-ride:${recurringRideId}:initial`, removeOnComplete: true, removeOnFail: 100 });
  }

  async onModuleDestroy() { await this.queue.close(); }
}
