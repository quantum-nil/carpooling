import { RoleCode, UserStatus } from '@prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import { ProfileService } from '../src/profile/profile.service';

describe('ProfileService', () => {
  const prisma = {
    user: { findUnique: jest.fn(), update: jest.fn() },
    auditLog: { create: jest.fn() },
  } as unknown as PrismaService;
  const service = new ProfileService(prisma);

  const user = {
    id: 'user-id',
    email: 'person@example.com',
    passwordHash: 'must-not-leak',
    displayName: 'Person',
    phoneNumber: '+919876543210',
    status: UserStatus.ACTIVE,
    deletedAt: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    roles: [{ role: { code: RoleCode.CUSTOMER } }],
    employee: null,
    customer: { status: 'ACTIVE' },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(user);
    (prisma.user.update as jest.Mock).mockResolvedValue(user);
    (prisma.auditLog.create as jest.Mock).mockResolvedValue({});
  });

  it('returns a safe profile with role-specific customer data', async () => {
    const result = await service.getProfile('user-id');

    expect(result).toMatchObject({
      id: 'user-id',
      email: 'person@example.com',
      customer: { status: 'ACTIVE' },
    });
    expect(result).not.toHaveProperty('passwordHash');
    expect(result).not.toHaveProperty('deletedAt');
  });

  it('updates only permitted profile fields and records an audit event', async () => {
    await service.updateOwnProfile('user-id', { displayName: 'Updated Person' });

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-id' },
      data: { displayName: 'Updated Person' },
    });
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: 'USER_PROFILE_UPDATED', actorUserId: 'user-id' }),
    });
  });

  it('supports an explicitly authorized admin update without accepting role fields', async () => {
    await service.updateProfile('admin-id', 'user-id', { phoneNumber: '+919876543211' });

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-id' },
      data: { phoneNumber: '+919876543211' },
    });
    expect(prisma.user.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ roles: expect.anything() }) }),
    );
  });
});
