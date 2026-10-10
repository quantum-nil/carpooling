import { applyDecorators, UseGuards } from '@nestjs/common';
import type { RoleCode } from '@prisma/client';
import { AccessTokenGuard } from './access-token.guard';
import { Roles } from './roles.decorator';
import { RolesGuard } from './roles.guard';

export const RequireRoles = (...roles: RoleCode[]) =>
  applyDecorators(Roles(...roles), UseGuards(AccessTokenGuard, RolesGuard));
