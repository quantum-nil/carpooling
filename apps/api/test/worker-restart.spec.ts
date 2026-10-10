jest.mock('bullmq', () => ({
  Worker: jest.fn().mockImplementation((_queue: string, processor: (job: unknown) => unknown) => ({
    processor,
    close: jest.fn().mockResolvedValue(undefined),
  })),
}));

import { Worker } from 'bullmq';
import { OfferExpirationProcessor } from '../src/matching/offer-expiration.processor';

describe('Background worker recovery', () => {
  beforeEach(() => jest.clearAllMocks());

  it('re-registers the expiration handler after a worker restart', async () => {
    const lifecycle = { expireOffer: jest.fn().mockResolvedValue({ matched: false }) };
    const config = { getOrThrow: jest.fn().mockReturnValue('redis://localhost:6379') };

    const first = new OfferExpirationProcessor(lifecycle as never, config as never);
    first.onModuleInit();
    const firstHandler = (Worker as unknown as jest.Mock).mock.calls[0][1] as (job: { data: { offerId: string } }) => Promise<unknown>;
    await firstHandler({ data: { offerId: 'offer-after-restart' } });

    const second = new OfferExpirationProcessor(lifecycle as never, config as never);
    second.onModuleInit();
    const secondHandler = (Worker as unknown as jest.Mock).mock.calls[1][1] as (job: { data: { offerId: string } }) => Promise<unknown>;
    await secondHandler({ data: { offerId: 'offer-after-restart' } });

    expect(Worker).toHaveBeenCalledTimes(2);
    expect(lifecycle.expireOffer).toHaveBeenCalledTimes(2);
    expect(lifecycle.expireOffer).toHaveBeenCalledWith('offer-after-restart');
  });
});
