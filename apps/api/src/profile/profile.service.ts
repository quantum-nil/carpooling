import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, RoleCode, UserStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { ProfileUpdateInput } from './profile.schemas';

const profileInclude = {
  roles: { include: { role: true } },
  employee: true,
  customer: true,
} satisfies Prisma.UserInclude;

type UserWithProfile = Prisma.UserGetPayload<{ include: typeof profileInclude }>;

@Injectable()
export class ProfileService {
  constructor(private readonly prisma: PrismaService) {}

  async getProfile(userId: string) {
    const user = await this.findActiveUser(userId);
    return this.toProfile(user);
  }

  async updateOwnProfile(userId: string, input: ProfileUpdateInput) {
    return this.updateProfile(userId, userId, input);
  }

  async updateProfile(actorUserId: string, targetUserId: string, input: ProfileUpdateInput) {
    await this.findActiveUser(targetUserId);
    await this.prisma.user.update({ where: { id: targetUserId }, data: input });
    await this.prisma.auditLog.create({
      data: {
        actorUserId,
        entityType: 'User',
        entityId: targetUserId,
        action: actorUserId === targetUserId ? 'USER_PROFILE_UPDATED' : 'USER_PROFILE_UPDATED_BY_ADMIN',
      },
    });
    return this.getProfile(targetUserId);
  }

  private async findActiveUser(userId: string): Promise<UserWithProfile> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, include: profileInclude });
    if (!user || user.status !== UserStatus.ACTIVE || user.deletedAt) {
      throw new NotFoundException('Profile not found');
    }
    return user;
  }

  private toProfile(user: UserWithProfile) {
    const roles = user.roles.map(({ role }) => role.code);
    const profile: {
      id: string;
      email: string;
      displayName: string | null;
      phoneNumber: string | null;
      status: UserStatus;
      roles: RoleCode[];
      createdAt: Date;
      updatedAt: Date;
      employee?: { employeeCode: string; status: NonNullable<UserWithProfile['employee']>['status'] };
      customer?: { status: NonNullable<UserWithProfile['customer']>['status'] };
    } = {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      phoneNumber: user.phoneNumber,
      status: user.status,
      roles,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };

    if (roles.includes(RoleCode.EMPLOYEE) && user.employee) {
      profile.employee = { employeeCode: user.employee.employeeCode, status: user.employee.status };
    }
    if (roles.includes(RoleCode.CUSTOMER) && user.customer) {
      profile.customer = { status: user.customer.status };
    }
    return profile;
  }
}
