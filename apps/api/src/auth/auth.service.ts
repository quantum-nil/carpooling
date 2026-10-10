import {
  ConflictException,
  Injectable,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, type JwtSignOptions } from '@nestjs/jwt';
import { RoleCode, UserStatus } from '@prisma/client';
import { createHash, randomBytes } from 'node:crypto';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import type { AppEnv } from '../config/env';
import type {
  AccessTokenPayload,
  AuthSession,
  PublicUser,
} from './auth.types';
import type {
  LoginInput,
  PasswordResetConfirmInput,
  PasswordResetRequestInput,
  RegisterInput,
} from './auth.schemas';

const PASSWORD_HASH_ROUNDS = 12;
// A valid fixed hash keeps login timing comparable when an email is unknown.
const DUMMY_PASSWORD_HASH = '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<AppEnv>,
  ) {}

  async register(input: RegisterInput): Promise<AuthSession> {
    const email = input.email.toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException('An account with these credentials already exists');
    }

    const passwordHash = await bcrypt.hash(input.password, PASSWORD_HASH_ROUNDS);
    const role = await this.prisma.role.upsert({
      where: { code: RoleCode.CUSTOMER },
      update: {},
      create: { code: RoleCode.CUSTOMER },
    });
    const user = await this.prisma.user.create({
      data: {
        email,
        passwordHash,
        roles: { create: { roleId: role.id } },
        customer: { create: {} },
      },
      include: { roles: { include: { role: true } } },
    });

    await this.writeAudit(user.id, 'USER_REGISTERED', 'User', user.id);
    return this.issueSession(this.toPublicUser(user));
  }

  async login(input: LoginInput): Promise<AuthSession> {
    const email = input.email.toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: { roles: { include: { role: true } } },
    });
    const validPassword = await bcrypt.compare(input.password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);
    if (!user || !validPassword || user.status !== UserStatus.ACTIVE || user.deletedAt) {
      throw new UnauthorizedException('Invalid email or password');
    }

    await this.writeAudit(user.id, 'USER_LOGIN', 'User', user.id);
    return this.issueSession(this.toPublicUser(user));
  }

  async refresh(refreshToken: string): Promise<AuthSession> {
    const tokenHash = this.hashToken(refreshToken);
    const nextToken = this.createRefreshToken();
    const expiresAt = this.refreshExpiry();
    const publicUser = await this.prisma.$transaction(async (tx) => {
      const stored = await tx.refreshToken.findUnique({
        where: { tokenHash },
        include: { user: { include: { roles: { include: { role: true } } } } },
      });
      if (!stored || stored.revokedAt || stored.expiresAt <= new Date()) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      await tx.$queryRaw`SELECT "id" FROM "RefreshToken" WHERE "id" = ${stored.id} FOR UPDATE`;
      const current = await tx.refreshToken.findUnique({
        where: { id: stored.id },
        include: { user: { include: { roles: { include: { role: true } } } } },
      });
      if (!current || current.revokedAt || current.expiresAt <= new Date()) {
        throw new UnauthorizedException('Invalid refresh token');
      }
      if (current.user.status !== UserStatus.ACTIVE || current.user.deletedAt) {
        throw new UnauthorizedException('Account is not active');
      }

      const revoked = await tx.refreshToken.updateMany({
        where: { id: current.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      if (revoked.count !== 1) throw new UnauthorizedException('Invalid refresh token');
      await tx.refreshToken.create({
        data: { userId: current.user.id, tokenHash: this.hashToken(nextToken), expiresAt },
      });
      return this.toPublicUser(current.user);
    });
    return { accessToken: await this.createAccessToken(publicUser), user: publicUser, refreshToken: nextToken };
  }

  async logout(refreshToken?: string): Promise<void> {
    if (!refreshToken) return;
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: this.hashToken(refreshToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async requestPasswordReset(input: PasswordResetRequestInput): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { email: input.email.toLowerCase() } });
    if (!user || user.status !== UserStatus.ACTIVE || user.deletedAt) return;

    const token = this.createRefreshToken();
    await this.prisma.$transaction([
      this.prisma.passwordResetToken.updateMany({
        where: { userId: user.id, usedAt: null },
        data: { usedAt: new Date() },
      }),
      this.prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash: this.hashToken(token),
          expiresAt: new Date(Date.now() + this.config.getOrThrow('PASSWORD_RESET_TOKEN_TTL_MINUTES') * 60_000),
        },
      }),
    ]);
    await this.writeAudit(user.id, 'PASSWORD_RESET_REQUESTED', 'User', user.id);
    // An email provider can consume this event later; the raw token is never persisted or returned.
  }

  async confirmPasswordReset(input: PasswordResetConfirmInput): Promise<void> {
    const tokenHash = this.hashToken(input.token);
    const passwordHash = await bcrypt.hash(input.password, PASSWORD_HASH_ROUNDS);
    await this.prisma.$transaction(async (tx) => {
      const resetToken = await tx.passwordResetToken.findUnique({ where: { tokenHash } });
      if (!resetToken) throw new BadRequestException('Invalid or expired password reset token');
      await tx.$queryRaw`SELECT "id" FROM "PasswordResetToken" WHERE "id" = ${resetToken.id} FOR UPDATE`;
      const current = await tx.passwordResetToken.findUnique({ where: { id: resetToken.id } });
      if (!current || current.usedAt || current.expiresAt <= new Date()) {
        throw new BadRequestException('Invalid or expired password reset token');
      }
      await tx.user.update({ where: { id: current.userId }, data: { passwordHash } });
      const used = await tx.passwordResetToken.updateMany({
        where: { id: current.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      if (used.count !== 1) throw new BadRequestException('Invalid or expired password reset token');
      await tx.refreshToken.updateMany({
        where: { userId: current.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await tx.auditLog.create({
        data: { actorUserId: current.userId, action: 'PASSWORD_RESET_COMPLETED', entityType: 'User', entityId: current.userId },
      });
    });
  }

  private async issueSession(user: PublicUser): Promise<AuthSession> {
    const refreshToken = this.createRefreshToken();
    await this.prisma.refreshToken.create({
      data: { userId: user.id, tokenHash: this.hashToken(refreshToken), expiresAt: this.refreshExpiry() },
    });
    return { accessToken: await this.createAccessToken(user), user, refreshToken };
  }

  async createAccessToken(user: PublicUser): Promise<string> {
    const payload: AccessTokenPayload = { sub: user.id, email: user.email, roles: user.roles };
    const options: JwtSignOptions = { expiresIn: this.config.getOrThrow('AUTH_ACCESS_TOKEN_TTL') as JwtSignOptions['expiresIn'] };
    return this.jwt.signAsync(payload, options);
  }

  private toPublicUser(user: { id: string; email: string; status: UserStatus; roles: { role: { code: RoleCode } }[] }): PublicUser {
    return { id: user.id, email: user.email, status: user.status, roles: user.roles.map(({ role }) => role.code) };
  }

  private createRefreshToken(): string {
    return randomBytes(48).toString('base64url');
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private refreshExpiry(): Date {
    return new Date(Date.now() + this.config.getOrThrow('AUTH_REFRESH_TOKEN_TTL_DAYS') * 86_400_000);
  }

  private async writeAudit(actorUserId: string, action: string, entityType: string, entityId: string) {
    await this.prisma.auditLog.create({ data: { actorUserId, action, entityType, entityId } });
  }
}
