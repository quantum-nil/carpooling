import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { DriverAvailability, DriverStatus, EmployeeStatus } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../src/prisma/prisma.service';
import { RedisService } from '../src/redis/redis.service';
import { DriverLocationService } from '../src/driver-location/driver-location.service';

describe('DriverLocationService', () => {
  const prisma = {
    employee: { findUnique: jest.fn() },
    driverLocationHistory: { create: jest.fn() },
  } as unknown as PrismaService;
  const redis = {
    get: jest.fn(),
    setWithExpiry: jest.fn(),
  } as unknown as RedisService;
  const config = { getOrThrow: jest.fn().mockReturnValue(120) } as unknown as ConfigService;
  const service = new DriverLocationService(prisma, redis, config);

  const availableDriver = {
    id: 'employee-id',
    userId: 'driver-user-id',
    status: EmployeeStatus.ACTIVE,
    driverStatus: DriverStatus.ACTIVE,
    availability: DriverAvailability.AVAILABLE,
    deletedAt: null,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.employee.findUnique as jest.Mock).mockResolvedValue(availableDriver);
    (prisma.driverLocationHistory.create as jest.Mock).mockResolvedValue({});
    (redis.setWithExpiry as jest.Mock).mockResolvedValue('OK');
  });

  it('stores a valid location in PostgreSQL history and Redis current state', async () => {
    const result = await service.updateOwnLocation('driver-user-id', { latitude: 12.9716, longitude: 77.5946 });

    expect(result).toMatchObject({ employeeId: 'employee-id', latitude: 12.9716, longitude: 77.5946, stale: false });
    expect(prisma.driverLocationHistory.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ employeeId: 'employee-id', latitude: expect.anything(), longitude: expect.anything(), recordedAt: expect.any(Date) }),
    });
    expect(redis.setWithExpiry).toHaveBeenCalledWith('driver:location:employee-id', expect.any(String), 180);
  });

  it('rejects unauthorized users and unavailable drivers', async () => {
    (prisma.employee.findUnique as jest.Mock).mockResolvedValue(null);
    await expect(service.updateOwnLocation('not-a-driver', { latitude: 12, longitude: 77 })).rejects.toBeInstanceOf(ForbiddenException);

    (prisma.employee.findUnique as jest.Mock).mockResolvedValue({ ...availableDriver, availability: DriverAvailability.UNAVAILABLE });
    await expect(service.updateOwnLocation('driver-user-id', { latitude: 12, longitude: 77 })).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.driverLocationHistory.create).not.toHaveBeenCalled();
  });

  it('marks a cached location stale when it exceeds the configured threshold', async () => {
    const oldTimestamp = new Date(Date.now() - 121_000).toISOString();
    (redis.get as jest.Mock).mockResolvedValue(JSON.stringify({ latitude: 12, longitude: 77, recordedAt: oldTimestamp }));

    await expect(service.getCurrentLocation('employee-id')).resolves.toMatchObject({
      employeeId: 'employee-id', stale: true, latitude: 12, longitude: 77,
    });
  });

  it('returns success after PostgreSQL persistence when Redis is unavailable', async () => {
    (redis.setWithExpiry as jest.Mock).mockRejectedValue(new Error('Redis unavailable'));

    await expect(service.updateOwnLocation('driver-user-id', { latitude: 12, longitude: 77 })).resolves.toMatchObject({
      employeeId: 'employee-id', latitude: 12, longitude: 77, stale: false,
    });
    expect(prisma.driverLocationHistory.create).toHaveBeenCalled();
  });
});
