import { RoleCode, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../src/auth/auth.service';
import { PrismaService } from '../src/prisma/prisma.service';

describe('AuthService', () => {
  const prisma = {
    user: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    role: { upsert: jest.fn() },
    refreshToken: { create: jest.fn(), findUnique: jest.fn(), updateMany: jest.fn() },
    passwordResetToken: { findUnique: jest.fn(), updateMany: jest.fn(), create: jest.fn() },
    auditLog: { create: jest.fn() },
    $queryRaw: jest.fn(),
    $transaction: jest.fn(),
  } as unknown as PrismaService;
  const jwt = { signAsync: jest.fn().mockResolvedValue('access-token') } as unknown as JwtService;
  const config = {
    getOrThrow: jest.fn((key: string) => ({
      AUTH_ACCESS_TOKEN_SECRET: 'a'.repeat(32),
      AUTH_ACCESS_TOKEN_TTL: '15m',
      AUTH_REFRESH_TOKEN_TTL_DAYS: 30,
    })[key]),
  } as unknown as ConfigService;
  const service = new AuthService(prisma, jwt, config);

  beforeEach(() => jest.clearAllMocks());

  it('hashes the password and returns no password hash', async () => {
    const role = { id: 'role-id' };
    const user = {
      id: 'user-id',
      email: 'person@example.com',
      status: UserStatus.ACTIVE,
      deletedAt: null,
      passwordHash: await bcrypt.hash('a-secure-password', 4),
      roles: [{ role: { code: RoleCode.CUSTOMER } }],
    };
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
    (prisma.role.upsert as jest.Mock).mockResolvedValue(role);
    (prisma.user.create as jest.Mock).mockImplementation(async ({ data }: { data: { passwordHash: string } }) => ({
      ...user,
      passwordHash: data.passwordHash,
    }));

    const result = await service.register({ email: 'PERSON@example.com', password: 'a-secure-password' });

    expect(prisma.user.create).toHaveBeenCalled();
    expect((prisma.user.create as jest.Mock).mock.calls[0][0].data.passwordHash).not.toBe('a-secure-password');
    expect(result).not.toHaveProperty('passwordHash');
    expect(result.user.email).toBe('person@example.com');
  });

  it('rejects invalid credentials without revealing which field failed', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);

    await expect(service.login({ email: 'missing@example.com', password: 'a-secure-password' })).rejects.toThrow(
      'Invalid email or password',
    );
    expect(jwt.signAsync).not.toHaveBeenCalled();
  });

  it('rotates refresh tokens under a row lock and revokes the consumed token', async () => {
    const stored = {
      id: 'refresh-id',
      userId: 'user-id',
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      user: { id: 'user-id', email: 'person@example.com', status: UserStatus.ACTIVE, deletedAt: null, roles: [{ role: { code: RoleCode.CUSTOMER } }] },
    };
    (prisma.refreshToken.findUnique as jest.Mock).mockResolvedValue(stored);
    (prisma.refreshToken.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
    (prisma.refreshToken.create as jest.Mock).mockResolvedValue({});
    (prisma.$transaction as jest.Mock).mockImplementation((callback: (tx: typeof prisma) => unknown) => callback(prisma));

    const result = await service.refresh('refresh-token');

    expect(result.user.id).toBe('user-id');
    expect(prisma.$queryRaw).toHaveBeenCalled();
    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'refresh-id', revokedAt: null },
    }));
    expect(prisma.refreshToken.create).toHaveBeenCalled();
  });

  it('rejects a refresh token that was consumed while waiting for the row lock', async () => {
    const stored = {
      id: 'refresh-id',
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      user: { id: 'user-id', email: 'person@example.com', status: UserStatus.ACTIVE, deletedAt: null, roles: [{ role: { code: RoleCode.CUSTOMER } }] },
    };
    (prisma.refreshToken.findUnique as jest.Mock)
      .mockResolvedValueOnce(stored)
      .mockResolvedValueOnce({ ...stored, revokedAt: new Date() });
    (prisma.$transaction as jest.Mock).mockImplementation((callback: (tx: typeof prisma) => unknown) => callback(prisma));

    await expect(service.refresh('refresh-token')).rejects.toThrow('Invalid refresh token');
    expect(prisma.refreshToken.create).not.toHaveBeenCalled();
  });

  it('consumes a password reset token transactionally and revokes sessions', async () => {
    const resetToken = { id: 'reset-id', userId: 'user-id', usedAt: null, expiresAt: new Date(Date.now() + 60_000) };
    (prisma.passwordResetToken.findUnique as jest.Mock).mockResolvedValue(resetToken);
    (prisma.user.update as jest.Mock).mockResolvedValue({});
    (prisma.passwordResetToken.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
    (prisma.refreshToken.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
    (prisma.$transaction as jest.Mock).mockImplementation((callback: (tx: typeof prisma) => unknown) => callback(prisma));

    await service.confirmPasswordReset({ token: 'reset-token', password: 'a-new-secure-password' });

    expect(prisma.$queryRaw).toHaveBeenCalled();
    expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'user-id' } }));
    expect(prisma.passwordResetToken.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'reset-id', usedAt: null } }));
    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: 'user-id', revokedAt: null } }));
    expect(prisma.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: 'PASSWORD_RESET_COMPLETED' }) }));
  });
});
