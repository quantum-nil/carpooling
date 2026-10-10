import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { DriverAvailability, DriverStatus, EmployeeStatus, Prisma } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import type { AppEnv } from '../config/env';
import type { DriverLocationInput } from './driver-location.schemas';

const LOCATION_KEY_PREFIX = 'driver:location:';

interface CachedLocation {
  latitude: number;
  longitude: number;
  recordedAt: string;
}

@Injectable()
export class DriverLocationService {
  private readonly staleSeconds: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    config: ConfigService<AppEnv>,
  ) {
    this.staleSeconds = config.getOrThrow('DRIVER_LOCATION_STALE_SECONDS');
  }

  async updateOwnLocation(userId: string, input: DriverLocationInput) {
    const employee = await this.findDriverForUser(userId);
    if (employee.availability !== DriverAvailability.AVAILABLE) {
      throw new BadRequestException('Only an available driver can update location');
    }

    const recordedAt = new Date();
    await this.prisma.driverLocationHistory.create({
      data: {
        employeeId: employee.id,
        latitude: new Prisma.Decimal(input.latitude),
        longitude: new Prisma.Decimal(input.longitude),
        recordedAt,
      },
    });
    // PostgreSQL is the historical source of truth; the Redis write is a best-effort cache update.
    // A Redis outage must not make an already-persisted location update appear unsuccessful.
    try {
      await this.redis.setWithExpiry(
        this.locationKey(employee.id),
        JSON.stringify({ ...input, recordedAt: recordedAt.toISOString() } satisfies CachedLocation),
        this.staleSeconds + 60,
      );
    } catch {
      // The next location update or cache expiry recovery will repopulate current state.
    }
    return { employeeId: employee.id, ...input, recordedAt, stale: false };
  }

  async getOwnLocation(userId: string) {
    const employee = await this.findDriverForUser(userId);
    return this.getCurrentLocation(employee.id);
  }

  async getCurrentLocation(employeeId: string) {
    const raw = await this.redis.get(this.locationKey(employeeId));
    if (!raw) return null;
    let location: CachedLocation;
    try {
      location = JSON.parse(raw) as CachedLocation;
    } catch {
      return null;
    }
    const recordedAt = new Date(location.recordedAt);
    if (Number.isNaN(recordedAt.getTime())) return null;
    const ageSeconds = Math.max(0, (Date.now() - recordedAt.getTime()) / 1000);
    return { employeeId, latitude: location.latitude, longitude: location.longitude, recordedAt, ageSeconds, stale: ageSeconds > this.staleSeconds };
  }

  private async findDriverForUser(userId: string) {
    const employee = await this.prisma.employee.findUnique({ where: { userId } });
    if (!employee || employee.deletedAt || employee.status !== EmployeeStatus.ACTIVE || employee.driverStatus !== DriverStatus.ACTIVE) {
      throw new ForbiddenException('Active driver access required');
    }
    return employee;
  }

  private locationKey(employeeId: string) {
    return `${LOCATION_KEY_PREFIX}${employeeId}`;
  }
}
