import { DocumentStatus, DriverAvailability, DriverDocumentType, DriverStatus, EmployeeStatus, UserStatus } from '@prisma/client';
import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service';
import { EmployeeService } from '../src/employee/employee.service';

describe('EmployeeService state transitions', () => {
  const prisma = {
    employee: { findUnique: jest.fn(), update: jest.fn() },
    vehicle: { findFirst: jest.fn().mockResolvedValue(null), update: jest.fn() },
    auditLog: { create: jest.fn() },
  } as unknown as PrismaService;
  const service = new EmployeeService(prisma);

  const employee = {
    id: 'employee-id',
    userId: 'user-id',
    employeeCode: 'EMP-001',
    status: EmployeeStatus.ACTIVE,
    driverStatus: DriverStatus.PENDING_APPROVAL,
    availability: DriverAvailability.OFFLINE,
    driverDecisionAt: null,
    driverDecisionNote: null,
    driverReviewedById: null,
    deletedAt: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    user: { id: 'user-id', email: 'driver@example.com', displayName: 'Driver', phoneNumber: null, status: UserStatus.ACTIVE },
    driverDocuments: [
      { documentType: DriverDocumentType.DRIVING_LICENSE, status: DocumentStatus.VERIFIED },
      { documentType: DriverDocumentType.IDENTITY, status: DocumentStatus.VERIFIED },
    ],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.employee.findUnique as jest.Mock).mockResolvedValue(employee);
    (prisma.employee.update as jest.Mock).mockImplementation(async ({ data }: { data: object }) => ({ ...employee, ...data }));
    (prisma.auditLog.create as jest.Mock).mockResolvedValue({});
  });

  it('approves a driver and starts them offline', async () => {
    const result = await service.reviewDriver('employee-id', { decision: 'APPROVE' }, 'admin-id');

    expect(prisma.employee.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'employee-id' },
      data: expect.objectContaining({
        driverStatus: DriverStatus.ACTIVE,
        availability: DriverAvailability.OFFLINE,
        driverReviewedById: 'admin-id',
      }),
    }));
    expect(result.driverStatus).toBe(DriverStatus.ACTIVE);
  });

  it('requires a reason and transitions rejected drivers to rejected', async () => {
    await expect(service.reviewDriver('employee-id', { decision: 'REJECT', note: 'Incomplete documents' }, 'admin-id')).resolves.toMatchObject({
      driverStatus: DriverStatus.REJECTED,
    });
    expect(prisma.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: 'DRIVER_REJECTED' }),
    }));
  });

  it('does not allow a rejected driver to be directly activated', async () => {
    (prisma.employee.findUnique as jest.Mock).mockResolvedValue({ ...employee, driverStatus: DriverStatus.REJECTED });

    await expect(service.setDriverStatus('employee-id', { status: 'ACTIVE' }, 'admin-id')).rejects.toThrow(
      'A rejected driver must be approved before activation',
    );
  });

  it('does not allow availability changes before driver approval', async () => {
    await expect(service.updateOwnAvailability('user-id', { availability: 'AVAILABLE' })).rejects.toThrow(
      'Only an active driver can change availability',
    );
  });

  it('allows an approved driver to change availability', async () => {
    (prisma.employee.findUnique as jest.Mock).mockResolvedValue({
      ...employee,
      driverStatus: DriverStatus.ACTIVE,
    });

    const result = await service.updateOwnAvailability('user-id', { availability: 'AVAILABLE' });

    expect(result.availability).toBe(DriverAvailability.AVAILABLE);
  });

  it('rejects approval for an inactive employee', async () => {
    (prisma.employee.findUnique as jest.Mock).mockResolvedValue({ ...employee, status: EmployeeStatus.INACTIVE });

    await expect(service.reviewDriver('employee-id', { decision: 'APPROVE' }, 'admin-id')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
