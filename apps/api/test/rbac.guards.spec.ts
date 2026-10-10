import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RoleCode, UserStatus } from '@prisma/client';
import { AccessTokenGuard } from '../src/auth/access-token.guard';
import { ROLES_KEY, Roles } from '../src/auth/roles.decorator';
import { RolesGuard } from '../src/auth/roles.guard';
import { PrismaService } from '../src/prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

function contextFor(requiredRole?: RoleCode, user?: { sub: string }) {
  const handler = jest.fn();
  if (requiredRole) Reflect.defineMetadata(ROLES_KEY, [requiredRole], handler);
  return {
    request: { user },
    context: {
      getHandler: () => handler,
      getClass: () => class TestController {},
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
    } as unknown as ExecutionContext,
  };
}

describe('RBAC guards', () => {
  const prisma = {
    user: { findUnique: jest.fn() },
  } as unknown as PrismaService;
  const rolesGuard = new RolesGuard(new Reflector(), prisma);

  beforeEach(() => jest.clearAllMocks());

  it.each([
    [RoleCode.ADMIN, RoleCode.ADMIN],
    [RoleCode.EMPLOYEE, RoleCode.EMPLOYEE],
    [RoleCode.CUSTOMER, RoleCode.CUSTOMER],
  ])('allows %s access to a matching protected permission', async (requiredRole, currentRole) => {
    const { context } = contextFor(requiredRole, { sub: 'user-id' });
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      status: UserStatus.ACTIVE,
      deletedAt: null,
      roles: [{ role: { code: currentRole } }],
    });

    expect(await rolesGuard.canActivate(context)).toBe(true);
  });

  it('rejects an authenticated user with the wrong role', async () => {
    const { context } = contextFor(RoleCode.ADMIN, { sub: 'customer-id' });
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      status: UserStatus.ACTIVE,
      deletedAt: null,
      roles: [{ role: { code: RoleCode.CUSTOMER } }],
    });

    await expect(rolesGuard.canActivate(context)).rejects.toThrow('Insufficient permissions');
  });

  it('rejects an unauthenticated request before checking roles', async () => {
    const { context } = contextFor(RoleCode.CUSTOMER);

    await expect(rolesGuard.canActivate(context)).rejects.toThrow('Authentication required');
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('provides reusable role metadata through the decorator', () => {
    const handler = jest.fn();
    Roles(RoleCode.EMPLOYEE)(handler);

    expect(Reflect.getMetadata(ROLES_KEY, handler)).toEqual([RoleCode.EMPLOYEE]);
  });
});

describe('authentication guard integration', () => {
  it('rejects requests without a bearer token', async () => {
    const jwt = {} as JwtService;
    const config = {} as ConfigService;
    const guard = new AccessTokenGuard(jwt, config);
    const { context } = contextFor(RoleCode.ADMIN);

    await expect(guard.canActivate(context)).rejects.toThrow('Access token required');
  });
});
