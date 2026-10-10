import { ServiceUnavailableException } from '@nestjs/common';
import { AppController } from '../src/app.controller';

describe('Health endpoints', () => {
  it('reports readiness only when PostgreSQL and Redis respond', async () => {
    const controller = new AppController(
      { $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]) } as never,
      { ping: jest.fn().mockResolvedValue('PONG') } as never,
    );

    await expect(controller.readiness()).resolves.toEqual({ status: 'ready' });
  });

  it('returns a service-unavailable error when a dependency is down', async () => {
    const controller = new AppController(
      { $queryRaw: jest.fn().mockRejectedValue(new Error('database unavailable')) } as never,
      { ping: jest.fn() } as never,
    );

    await expect(controller.readiness()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
