import { rideCreateSchema, rideTransitionSchema } from '../src/ride/ride.schemas';

describe('ride validation', () => {
  const validRide = {
    pickupAddress: 'A', pickupLatitude: 12, pickupLongitude: 77,
    destinationAddress: 'B', destinationLatitude: 13, destinationLongitude: 78,
    scheduledAt: '2026-12-01T10:00:00.000Z', seatsRequested: 2,
  };

  it('validates locations, seats, and future scheduling', () => {
    expect(rideCreateSchema.parse(validRide)).toMatchObject({ seatsRequested: 2, currency: 'INR' });
    expect(() => rideCreateSchema.parse({ ...validRide, pickupLatitude: 91 })).toThrow();
    expect(() => rideCreateSchema.parse({ ...validRide, seatsRequested: 0 })).toThrow();
  });

  it('requires cancellation reasons when cancelling', () => {
    expect(rideTransitionSchema.parse({ status: 'MATCHING' })).toEqual({ status: 'MATCHING' });
    expect(rideTransitionSchema.parse({ status: 'CANCELLED', cancellationReason: 'No longer needed' })).toEqual({
      status: 'CANCELLED', cancellationReason: 'No longer needed',
    });
  });
});
