import type { RoleCode, UserStatus } from '@prisma/client';

export interface AccessTokenPayload {
  sub: string;
  email: string;
  roles: RoleCode[];
}

export interface PublicUser {
  id: string;
  email: string;
  status: UserStatus;
  roles: RoleCode[];
}

export interface AuthResponse {
  accessToken: string;
  user: PublicUser;
}

export interface AuthSession extends AuthResponse {
  refreshToken: string;
}

export interface AuthenticatedRequest {
  user: AccessTokenPayload;
}
