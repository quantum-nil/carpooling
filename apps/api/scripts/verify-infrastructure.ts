import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';

async function verify() {
  const prisma = new PrismaClient();
  const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', { lazyConnect: true });

  try {
    await prisma.$connect();
    console.log('PostgreSQL connection: ok');
    await redis.connect();
    await redis.ping();
    console.log('Redis connection: ok');
  } finally {
    await prisma.$disconnect();
    redis.disconnect();
  }
}

verify().catch((error: unknown) => {
  console.error('Infrastructure verification failed', error);
  process.exitCode = 1;
});
