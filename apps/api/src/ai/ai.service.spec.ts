import { BadGatewayException, BadRequestException } from '@nestjs/common';
import { RideStatus } from '@prisma/client';
import { AiService } from './ai.service';

const rideId = '00000000-0000-0000-0000-000000000001';
const intent = { pickup: 'Koramangala', destination: 'Airport', scheduledAt: new Date(Date.now() + 3_600_000).toISOString(), preferences: ['quiet'], seatsRequested: 1 };

function provider() {
  return { extractRideIntent: jest.fn().mockResolvedValue(intent), summarizeRideOptions: jest.fn().mockResolvedValue({ summary: 'One suitable option', recommendations: [{ rideId, explanation: 'Matches the requested route' }, { rideId: '00000000-0000-0000-0000-000000000099', explanation: 'Should be removed' }] }) };
}

describe('AiService', () => {
  it('returns validated structured intent without changing application state', async () => {
    const aiProvider = provider();
    const prisma = { ride: { findMany: jest.fn() } };
    const service = new AiService(prisma as never, aiProvider as never);

    await expect(service.extractRideIntent('Take me from Koramangala to the airport tomorrow')).resolves.toEqual(intent);
    expect(prisma.ride.findMany).not.toHaveBeenCalled();
  });

  it('rejects malformed provider output', async () => {
    const aiProvider = provider();
    aiProvider.extractRideIntent.mockResolvedValue({ pickup: 'A' });
    const service = new AiService({} as never, aiProvider as never);
    await expect(service.extractRideIntent('invalid')).rejects.toBeInstanceOf(BadGatewayException);
  });

  it('rejects past times through normal backend validation', async () => {
    const aiProvider = provider();
    aiProvider.extractRideIntent.mockResolvedValue({ ...intent, scheduledAt: new Date(Date.now() - 1_000).toISOString() });
    const service = new AiService({} as never, aiProvider as never);
    await expect(service.extractRideIntent('yesterday')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('summarizes sanitized available options and drops unknown AI ride IDs', async () => {
    const aiProvider = provider();
    const prisma = { ride: { findMany: jest.fn().mockResolvedValue([{ id: rideId, pickupAddress: 'Koramangala', destinationAddress: 'Airport', scheduledAt: new Date(Date.now() + 3_600_000), seatCapacity: 3, estimatedFare: { toNumber: () => 250 }, currency: 'INR', participants: [{ seats: 1 }] }]) } };
    const service = new AiService(prisma as never, aiProvider as never);

    const result = await service.recommendRides('Find a quiet ride to the airport');

    expect(result.options).toHaveLength(1);
    expect(result.options[0].seatsAvailable).toBe(2);
    expect(result.recommendation.recommendations).toEqual([{ rideId, explanation: 'Matches the requested route' }]);
    expect(prisma.ride.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ status: { in: [RideStatus.OFFERED, RideStatus.ACCEPTED] } }) }));
  });

  it('does not expose or mutate authoritative ride state', async () => {
    const aiProvider = provider();
    const prisma = { ride: { findMany: jest.fn().mockResolvedValue([]), update: jest.fn(), create: jest.fn(), updateMany: jest.fn() } };
    const service = new AiService(prisma as never, aiProvider as never);
    await service.recommendRides('Find a ride');
    expect(prisma.ride.update).not.toHaveBeenCalled();
    expect(prisma.ride.create).not.toHaveBeenCalled();
    expect(prisma.ride.updateMany).not.toHaveBeenCalled();
  });
});
