import { ConfigService } from '@nestjs/config';
import { DriverAvailability, DriverStatus, EmployeeStatus, RideStatus, VehicleStatus } from '@prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import { DriverLocationService } from '../src/driver-location/driver-location.service';
import { MapsService } from '../src/maps/maps.service';
import { MatchingService } from '../src/matching/matching.service';
import { OfferExpirationQueueService } from '../src/matching/offer-expiration-queue.service';

describe('MatchingService', () => {
  const prisma = {
    ride: { findUnique: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
    employee: { findMany: jest.fn(), findUnique: jest.fn() },
    vehicle: { findUnique: jest.fn() },
    rideOffer: { create: jest.fn(), findMany: jest.fn() },
    auditLog: { create: jest.fn() },
    $transaction: jest.fn(),
    $queryRaw: jest.fn(),
  } as unknown as PrismaService;
  const locations = { getCurrentLocation: jest.fn() } as unknown as DriverLocationService;
  const maps = {
    calculateRoute: jest.fn(),
    calculateDistance: jest.fn(),
    calculateEta: jest.fn(),
  } as unknown as MapsService;
  const config = {
    getOrThrow: jest.fn((key: string) => ({
      MATCHING_MAX_DISTANCE_KM: 25,
      MATCHING_DISTANCE_WEIGHT: 1,
      MATCHING_ETA_WEIGHT: 1,
      MATCHING_ROUTE_WEIGHT: 1,
      MATCHING_OFFER_TTL_SECONDS: 60,
    })[key]),
  } as unknown as ConfigService;
  const expirationQueue = { schedule: jest.fn() } as unknown as OfferExpirationQueueService;
  const service = new MatchingService(prisma, locations, maps, expirationQueue, config);

  const driver = (id: string, userId: string, vehicleId: string) => ({
    id,
    status: EmployeeStatus.ACTIVE,
    driverStatus: DriverStatus.ACTIVE,
    availability: DriverAvailability.AVAILABLE,
    deletedAt: null,
    vehicles: [{ id: vehicleId, capacity: 4, status: VehicleStatus.ACTIVE, deletedAt: null }],
    userId,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.employee.findMany as jest.Mock).mockResolvedValue([driver('driver-1', 'user-1', 'vehicle-1')]);
    (locations.getCurrentLocation as jest.Mock).mockResolvedValue({ latitude: 12, longitude: 77, stale: false });
    (maps.calculateRoute as jest.Mock).mockResolvedValue({ distanceMeters: 1000, durationSeconds: 100 });
    (maps.calculateDistance as jest.Mock).mockResolvedValue({ distanceMeters: 900, durationSeconds: 90 });
    (maps.calculateEta as jest.Mock).mockResolvedValue({ durationSeconds: 80, arrivalAt: new Date() });
    (prisma.$transaction as jest.Mock).mockImplementation(async (callback: (transaction: typeof prisma) => unknown) => callback(prisma));
    (prisma.rideOffer.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.$queryRaw as jest.Mock).mockResolvedValue([{ id: 'locked' }]);
    (prisma.ride.findUnique as jest.Mock).mockResolvedValue({ id: 'ride-1', status: RideStatus.REQUESTED });
    (prisma.ride.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.employee.findUnique as jest.Mock).mockResolvedValue({ status: EmployeeStatus.ACTIVE, driverStatus: DriverStatus.ACTIVE, availability: DriverAvailability.AVAILABLE, deletedAt: null });
    (prisma.vehicle.findUnique as jest.Mock).mockResolvedValue({ status: VehicleStatus.ACTIVE, capacity: 4, assignedEmployeeId: 'driver-1', deletedAt: null });
    (prisma.rideOffer.create as jest.Mock).mockResolvedValue({ id: 'offer-1', driverId: 'driver-1' });
    (prisma.ride.update as jest.Mock).mockResolvedValue({});
    (prisma.auditLog.create as jest.Mock).mockResolvedValue({});
  });

  it('returns no match when there are no eligible drivers', async () => {
    (prisma.employee.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.ride.findUnique as jest.Mock).mockResolvedValue({ id: 'ride-1', status: RideStatus.REQUESTED, pickupLatitude: { toNumber: () => 12 }, pickupLongitude: { toNumber: () => 77 }, seatCapacity: 1, requests: [] });

    await expect(service.matchRide('ride-1')).resolves.toMatchObject({ matched: false, reason: 'NO_ELIGIBLE_DRIVER' });
  });

  it('ranks multiple drivers deterministically and chooses the best candidate', async () => {
    (prisma.employee.findMany as jest.Mock).mockResolvedValue([driver('driver-b', 'user-b', 'vehicle-b'), driver('driver-a', 'user-a', 'vehicle-a')]);
    (locations.getCurrentLocation as jest.Mock).mockResolvedValue({ latitude: 12, longitude: 77, stale: false });
    (prisma.ride.findUnique as jest.Mock).mockResolvedValue({ id: 'ride-1', status: RideStatus.REQUESTED, pickupLatitude: { toNumber: () => 12 }, pickupLongitude: { toNumber: () => 77 }, seatCapacity: 1, requests: [] });
    (prisma.rideOffer.create as jest.Mock).mockResolvedValue({ id: 'offer-1' });

    const ranked = await service.rankCandidates(12, 77, 1);
    expect(ranked.map((candidate) => candidate.employeeId)).toEqual(['driver-a', 'driver-b']);
  });

  it('excludes stale locations and route failures', async () => {
    (locations.getCurrentLocation as jest.Mock).mockResolvedValue({ latitude: 12, longitude: 77, stale: true });
    await expect(service.rankCandidates(12, 77, 1)).resolves.toEqual([]);
    expect(maps.calculateRoute).not.toHaveBeenCalled();
  });

  it('does not assign a driver when Redis location state is unavailable', async () => {
    (locations.getCurrentLocation as jest.Mock).mockRejectedValue(new Error('Redis unavailable'));
    (prisma.ride.findUnique as jest.Mock).mockResolvedValue({ id: 'ride-1', status: RideStatus.REQUESTED, pickupLatitude: { toNumber: () => 12 }, pickupLongitude: { toNumber: () => 77 }, seatCapacity: 1, requests: [] });
    await expect(service.matchRide('ride-1')).rejects.toThrow('Redis unavailable');
    expect(prisma.rideOffer.create).not.toHaveBeenCalled();
    expect(prisma.ride.update).not.toHaveBeenCalled();
  });

  it('excludes conflicting assignments and unavailable drivers', async () => {
    (prisma.ride.findFirst as jest.Mock).mockResolvedValue({ id: 'conflicting-ride' });
    (prisma.ride.findUnique as jest.Mock).mockResolvedValue({ id: 'ride-1', status: RideStatus.REQUESTED, pickupLatitude: { toNumber: () => 12 }, pickupLongitude: { toNumber: () => 77 }, seatCapacity: 1, requests: [] });
    await expect(service.matchRide('ride-1')).resolves.toMatchObject({ matched: false });

    (prisma.employee.findUnique as jest.Mock).mockResolvedValue({ status: EmployeeStatus.ACTIVE, driverStatus: DriverStatus.ACTIVE, availability: DriverAvailability.UNAVAILABLE, deletedAt: null });
    (prisma.ride.findFirst as jest.Mock).mockResolvedValue(null);
    await expect(service.matchRide('ride-1')).resolves.toMatchObject({ matched: false });
  });

  it('creates a locked offer for an eligible candidate', async () => {
    (prisma.ride.findUnique as jest.Mock).mockResolvedValue({ id: 'ride-1', status: RideStatus.REQUESTED, pickupLatitude: { toNumber: () => 12 }, pickupLongitude: { toNumber: () => 77 }, seatCapacity: 1, requests: [] });
    await expect(service.matchRide('ride-1')).resolves.toMatchObject({ matched: true, offer: { id: 'offer-1' } });
    expect(prisma.$queryRaw).toHaveBeenCalled();
    expect(prisma.rideOffer.create).toHaveBeenCalled();
  });
});
