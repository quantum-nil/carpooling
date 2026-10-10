import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserStatus, type RoleCode } from '@prisma/client';
import type { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { ROLES_KEY } from './roles.decorator';
import type { AccessTokenPayload } from './auth.types';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<RoleCode[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRoles?.length) return true;

    const request = context.switchToHttp().getRequest<Request & { user?: AccessTokenPayload }>();
    if (!request.user?.sub) throw new UnauthorizedException('Authentication required');

    const user = await this.prisma.user.findUnique({
      where: { id: request.user.sub },
      select: {
        status: true,
        deletedAt: true,
        roles: { select: { role: { select: { code: true } } } },
      },
    });
    if (!user || user.status !== UserStatus.ACTIVE || user.deletedAt) {
      throw new UnauthorizedException('Authentication required');
    }

    const currentRoles = user.roles.map(({ role }) => role.code);
    if (!requiredRoles.some((requiredRole) => currentRoles.includes(requiredRole))) {
      throw new ForbiddenException('Insufficient permissions');
    }
    return true;
  }
}
