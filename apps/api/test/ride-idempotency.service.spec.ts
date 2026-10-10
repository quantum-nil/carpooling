import { CustomerStatus, RideStatus } from '@prisma/client';
import { RideService } from '../src/ride/ride.service';

describe('Ride request idempotency', () => {
  it('returns the original ride for a repeated request key', async () => {
    const existingRide = {
      id: 'ride-id', requestedByCustomerId: 'customer-id', driver: null, vehicle: null,
      pickupAddress: 'Home', pickupLatitude: 12, pickupLongitude: 77, pickupPlaceId: null,
      destinationAddress: 'Office', destinationLatitude: 13, destinationLongitude: 78, destinationPlaceId: null,
      scheduledAt: new Date('2099-01-01'), status: RideStatus.REQUESTED, seatCapacity: 1,
      estimatedFare: null, finalFare: null, currency: 'INR', cancelledAt: null, cancellationReason: null,
      requests: [], participants: [], createdAt: new Date(), updatedAt: new Date(),
    };
    const prisma: any = {
      customer: { findUnique: jest.fn().mockResolvedValue({ id: 'customer-id', status: CustomerStatus.ACTIVE, deletedAt: null }) },
      rideRequest: { findUnique: jest.fn().mockResolvedValue({ ride: existingRide }) },
      ride: { create: jest.fn(), findUnique: jest.fn() },
      auditLog: { create: jest.fn() },
      $transaction: jest.fn((callback: (transaction: any) => unknown) => callback(prisma)),
    };
    const service = new RideService(prisma as never);

    const result = await service.createRide('customer-user-id', {
      idempotencyKey: 'ride-request-key-1',
      pickupAddress: 'Home', pickupLatitude: 12, pickupLongitude: 77,
      destinationAddress: 'Office', destinationLatitude: 13, destinationLongitude: 78,
      scheduledAt: new Date('2099-01-01'), seatsRequested: 1, currency: 'INR', estimatedFare: null,
    });

    expect(result.id).toBe('ride-id');
    expect(prisma.ride.create).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it('propagates database unavailability without publishing a ride event', async () => {
    const realtime = { publishRideRequested: jest.fn() };
    const prisma = {
      customer: { findUnique: jest.fn().mockResolvedValue({ id: 'customer-id', status: CustomerStatus.ACTIVE, deletedAt: null }) },
      $transaction: jest.fn().mockRejectedValue(new Error('database unavailable')),
    };
    const service = new RideService(prisma as never, realtime as never);

    await expect(service.createRide('customer-user-id', {
      pickupAddress: 'Home', pickupLatitude: 12, pickupLongitude: 77,
      destinationAddress: 'Office', destinationLatitude: 13, destinationLongitude: 78,
      scheduledAt: new Date('2099-01-01'), seatsRequested: 1, currency: 'INR', estimatedFare: null,
    })).rejects.toThrow('database unavailable');
    expect(realtime.publishRideRequested).not.toHaveBeenCalled();
  });
});
