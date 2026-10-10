import { CustomerStatus, UserStatus } from '@prisma/client';
import { ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service';
import { CustomerService } from '../src/customer/customer.service';

describe('CustomerService', () => {
  const prisma = {
    customer: { findUnique: jest.fn(), findMany: jest.fn(), update: jest.fn() },
    user: { update: jest.fn() },
    savedLocation: { create: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
    auditLog: { create: jest.fn() },
    $transaction: jest.fn(),
  } as unknown as PrismaService;
  const service = new CustomerService(prisma);

  const customer = {
    id: 'customer-id',
    userId: 'user-id',
    preferredSettings: { language: 'en' },
    status: CustomerStatus.ACTIVE,
    deletedAt: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    user: { id: 'user-id', email: 'customer@example.com', displayName: 'Customer', phoneNumber: null, status: UserStatus.ACTIVE },
    savedLocations: [],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.customer.findUnique as jest.Mock).mockResolvedValue(customer);
    (prisma.customer.update as jest.Mock).mockResolvedValue(customer);
    (prisma.user.update as jest.Mock).mockResolvedValue(customer.user);
    (prisma.auditLog.create as jest.Mock).mockResolvedValue({});
    (prisma.$transaction as jest.Mock).mockResolvedValue([]);
  });

  it('returns a customer profile with settings and no sensitive identity fields', async () => {
    const result = await service.getOwnProfile('user-id');

    expect(result).toMatchObject({ id: 'customer-id', status: CustomerStatus.ACTIVE, preferredSettings: { language: 'en' } });
    expect(result.user).not.toHaveProperty('passwordHash');
  });

  it('creates and updates locations only through the owning customer', async () => {
    (prisma.savedLocation.create as jest.Mock).mockResolvedValue({ id: 'location-id', customerId: 'customer-id' });
    await service.createOwnLocation('user-id', {
      label: 'Home', address: 'Main Street', latitude: 12.9716, longitude: 77.5946, placeId: null,
    });
    expect(prisma.savedLocation.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ customerId: 'customer-id', label: 'Home' }),
    });

    (prisma.savedLocation.findFirst as jest.Mock).mockResolvedValue(null);
    await expect(service.updateOwnLocation('user-id', 'other-location', { label: 'Work' })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows admin status management without allowing customer self-status changes', async () => {
    (prisma.customer.update as jest.Mock).mockResolvedValue({ ...customer, status: CustomerStatus.INACTIVE });
    await expect(service.updateStatus('customer-id', { status: 'INACTIVE' }, 'admin-id')).resolves.toMatchObject({
      status: CustomerStatus.INACTIVE,
    });
    expect(prisma.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: 'CUSTOMER_STATUS_UPDATED', actorUserId: 'admin-id' }),
    }));
  });
});
