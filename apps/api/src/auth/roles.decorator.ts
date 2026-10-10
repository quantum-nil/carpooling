import { SetMetadata } from '@nestjs/common';
import type { RoleCode } from '@prisma/client';

export const ROLES_KEY = 'auth:roles';
export const Roles = (...roles: RoleCode[]) => SetMetadata(ROLES_KEY, roles);
