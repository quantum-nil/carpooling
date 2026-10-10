import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Worker } from 'bullmq';
import type { AppEnv } from '../config/env';
import { RECURRING_RIDE_QUEUE } from './recurring-ride-queue.service';
import { RecurringRideService } from './recurring-ride.service';

@Injectable()
export class RecurringRideProcessor implements OnModuleInit, OnModuleDestroy {
  private worker?: Worker;

  constructor(private readonly recurringRides: RecurringRideService, private readonly config: ConfigService<AppEnv>) {}

  onModuleInit() {
    this.worker = new Worker(RECURRING_RIDE_QUEUE, async (job) => job.data.recurringRideId ? this.recurringRides.generateRule(job.data.recurringRideId) : this.recurringRides.generateDueRides(), { connection: { url: this.config.getOrThrow('REDIS_URL') } });
  }

  async onModuleDestroy() { await this.worker?.close(); }
}
