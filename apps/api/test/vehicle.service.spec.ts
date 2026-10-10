import { ForbiddenException } from '@nestjs/common';
import { RoleCode, VehicleStatus } from '@prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import { VehicleService } from '../src/vehicle/vehicle.service';

describe('VehicleService permissions and transitions', () => {
  const prisma = {
    user: { findUnique: jest.fn() },
    vehicle: { findUnique: jest.fn(), update: jest.fn(), findMany: jest.fn(), create: jest.fn() },
    employee: { findUnique: jest.fn() },
    auditLog: { create: jest.fn() },
  } as unknown as PrismaService;
  const service = new VehicleService(prisma);

  const vehicle = {
    id: 'vehicle-id',
    registrationNumber: 'KA01AB1234',
    capacity: 4,
    make: 'Example',
    model: 'Car',
    metadata: { color: 'blue' },
    status: VehicleStatus.ACTIVE,
    assignedEmployeeId: 'employee-id',
    deletedAt: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    assignedEmployee: { id: 'employee-id', userId: 'employee-user-id', employeeCode: 'EMP-001' },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.vehicle.findUnique as jest.Mock).mockResolvedValue(vehicle);
    (prisma.vehicle.update as jest.Mock).mockImplementation(async ({ data }: { data: object }) => ({ ...vehicle, ...data }));
    (prisma.auditLog.create as jest.Mock).mockResolvedValue({});
  });

  it('allows an admin to manage any vehicle', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      status: 'ACTIVE',
      deletedAt: null,
      roles: [{ role: { code: RoleCode.ADMIN } }],
    });

    const result = await service.updateVehicle('vehicle-id', { capacity: 6 }, 'admin-id');

    expect(result.capacity).toBe(6);
  });

  it('allows an employee to manage an assigned vehicle', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      status: 'ACTIVE',
      deletedAt: null,
      roles: [{ role: { code: RoleCode.EMPLOYEE } }],
    });

    await expect(service.updateVehicle('vehicle-id', { make: 'Updated' }, 'employee-user-id')).resolves.toMatchObject({
      make: 'Updated',
    });
  });

  it('rejects a customer and an unassigned employee', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      status: 'ACTIVE',
      deletedAt: null,
      roles: [{ role: { code: RoleCode.CUSTOMER } }],
    });
    await expect(service.updateVehicle('vehicle-id', { capacity: 5 }, 'customer-id')).rejects.toBeInstanceOf(ForbiddenException);

    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      status: 'ACTIVE',
      deletedAt: null,
      roles: [{ role: { code: RoleCode.EMPLOYEE } }],
    });
    await expect(service.updateVehicle('vehicle-id', { capacity: 5 }, 'other-employee-id')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('soft-removes a vehicle and clears its assignment', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      status: 'ACTIVE',
      deletedAt: null,
      roles: [{ role: { code: RoleCode.ADMIN } }],
    });

    const result = await service.removeVehicle('vehicle-id', 'admin-id');

    expect(prisma.vehicle.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: VehicleStatus.RETIRED, assignedEmployeeId: null }),
    }));
    expect(result.status).toBe(VehicleStatus.RETIRED);
  });
});
