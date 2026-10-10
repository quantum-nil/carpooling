import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import type { AppEnv } from '../config/env';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly client: Redis;

  constructor(config: ConfigService<AppEnv>) {
    this.client = new Redis(config.getOrThrow('REDIS_URL'), { lazyConnect: true });
  }

  get(key: string) {
    return this.client.get(key);
  }

  setWithExpiry(key: string, value: string, seconds: number) {
    return this.client.set(key, value, 'EX', seconds);
  }

  ping() {
    return this.client.ping();
  }

  async onModuleDestroy() {
    this.client.disconnect();
  }
}
