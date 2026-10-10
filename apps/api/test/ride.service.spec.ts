import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { RideStatus } from '@prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import { RIDE_TRANSITIONS, RideService } from '../src/ride/ride.service';

describe('RideService state machine', () => {
  const prisma = {
    ride: { findUnique: jest.fn(), update: jest.fn(), create: jest.fn() },
    user: { findUnique: jest.fn() },
    auditLog: { create: jest.fn() },
    $transaction: jest.fn(),
  } as unknown as PrismaService;
  const service = new RideService(prisma);

  const ride = {
    id: 'ride-id',
    requestedByCustomerId: 'customer-id',
    requestedByCustomer: { id: 'customer-id', userId: 'customer-user-id' },
    driver: { id: 'driver-id', userId: 'driver-user-id', employeeCode: 'EMP-001' },
    vehicle: { id: 'vehicle-id', registrationNumber: 'KA01AB1234', capacity: 4 },
    requests: [],
    participants: [],
    status: RideStatus.REQUESTED,
    pickupAddress: 'A',
    pickupLatitude: 12,
    pickupLongitude: 77,
    pickupPlaceId: null,
    destinationAddress: 'B',
    destinationLatitude: 13,
    destinationLongitude: 78,
    destinationPlaceId: null,
    scheduledAt: new Date('2026-12-01'),
    seatCapacity: 4,
    estimatedFare: null,
    finalFare: null,
    currency: 'INR',
    cancelledAt: null,
    cancelledByUserId: null,
    cancellationReason: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.$transaction as jest.Mock).mockImplementation(async (callback: (transaction: typeof prisma) => unknown) => callback(prisma));
    (prisma.ride.findUnique as jest.Mock).mockResolvedValue(ride);
    (prisma.ride.update as jest.Mock).mockImplementation(async ({ data }: { data: object }) => ({ ...ride, ...data }));
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({ roles: [{ role: { code: 'ADMIN' } }] });
    (prisma.auditLog.create as jest.Mock).mockResolvedValue({});
  });

  it('defines the complete linear happy path and terminal states', () => {
    expect(RIDE_TRANSITIONS[RideStatus.REQUESTED]).toEqual([RideStatus.MATCHING, RideStatus.CANCELLED, RideStatus.EXPIRED]);
    expect(RIDE_TRANSITIONS[RideStatus.IN_PROGRESS]).toEqual([RideStatus.COMPLETED]);
    expect(RIDE_TRANSITIONS[RideStatus.COMPLETED]).toEqual([]);
    expect(RIDE_TRANSITIONS[RideStatus.CANCELLED]).toEqual([]);
    expect(RIDE_TRANSITIONS[RideStatus.EXPIRED]).toEqual([]);
  });

  it.each(
    Object.entries(RIDE_TRANSITIONS).flatMap(([from, destinations]) =>
      destinations.map((to) => [from as RideStatus, to] as const),
    ),
  )('allows the valid transition %s -> %s', async (from, to) => {
    (prisma.ride.findUnique as jest.Mock).mockResolvedValue({ ...ride, status: from });
    const input = to === RideStatus.CANCELLED ? { status: to, cancellationReason: 'Test cancellation' } : { status: to };

    await expect(service.transitionRide('ride-id', input as Parameters<typeof service.transitionRide>[1], 'admin-id')).resolves.toMatchObject({ status: to });
  });

  it('rejects invalid transitions server-side', async () => {
    await expect(service.transitionRide('ride-id', { status: 'COMPLETED' }, 'admin-id')).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.ride.update).not.toHaveBeenCalled();
  });

  it('requires a cancellation reason and writes the cancellation audit atomically', async () => {
    await expect(service.transitionRide('ride-id', { status: 'CANCELLED' }, 'admin-id')).rejects.toThrow('Cancellation reason is required');
    const result = await service.transitionRide('ride-id', { status: 'CANCELLED', cancellationReason: 'Customer cancelled' }, 'admin-id');

    expect(result.status).toBe(RideStatus.CANCELLED);
    expect(prisma.ride.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ cancelledByUserId: 'admin-id', cancellationReason: 'Customer cancelled' }),
    }));
    expect(prisma.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: 'RIDE_CANCELLED' }),
    }));
  });

  it('allows only the requesting customer to cancel their ride', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({ roles: [{ role: { code: 'CUSTOMER' } }] });
    await expect(service.transitionRide('ride-id', { status: 'CANCELLED', cancellationReason: 'Changed plans' }, 'customer-user-id')).resolves.toMatchObject({ status: RideStatus.CANCELLED });
    await expect(service.transitionRide('ride-id', { status: 'CANCELLED', cancellationReason: 'Changed plans' }, 'other-customer-id')).rejects.toBeInstanceOf(ForbiddenException);
  });
});
