import { ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { IdentityVerificationStatus, UserStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { IDENTITY_VERIFICATION_PROVIDER, MANUAL_IDENTITY_PROVIDER_NAME, type IdentityVerificationProvider } from './identity-verification.types';
import type { ReviewIdentityVerificationInput } from './identity-verification.schemas';

@Injectable()
export class IdentityVerificationService {
  constructor(private readonly prisma: PrismaService, @Inject(IDENTITY_VERIFICATION_PROVIDER) private readonly provider: IdentityVerificationProvider) {}

  async request(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { status: true, deletedAt: true } });
    if (!user || user.status !== UserStatus.ACTIVE || user.deletedAt) throw new ForbiddenException('Active account required');
    const existing = await this.prisma.identityVerification.findFirst({ where: { userId, status: { in: [IdentityVerificationStatus.REQUESTED, IdentityVerificationStatus.PENDING] } }, orderBy: { createdAt: 'desc' } });
    if (existing) return existing;
    const verification = await this.prisma.identityVerification.create({ data: { userId, provider: MANUAL_IDENTITY_PROVIDER_NAME, status: IdentityVerificationStatus.REQUESTED } });
    try {
      const result = await this.provider.requestVerification({ verificationId: verification.id, userId });
      return this.prisma.$transaction((transaction) => transaction.identityVerification.update({ where: { id: verification.id }, data: { provider: result.provider, providerReference: result.providerReference, status: result.status } }));
    } catch (error) {
      return this.prisma.identityVerification.update({ where: { id: verification.id }, data: { status: IdentityVerificationStatus.FAILED, failureReason: error instanceof Error ? error.message : 'Identity verification provider failed', completedAt: new Date() } });
    }
  }

  listForUser(userId: string) { return this.prisma.identityVerification.findMany({ where: { userId }, select: { id: true, provider: true, providerReference: true, status: true, requestedAt: true, completedAt: true, rejectionReason: true, failureReason: true, createdAt: true, updatedAt: true }, orderBy: { createdAt: 'desc' } }); }

  async review(id: string, reviewerUserId: string, input: ReviewIdentityVerificationInput) {
    const reviewer = await this.prisma.user.findUnique({ where: { id: reviewerUserId }, select: { status: true, deletedAt: true, roles: { select: { role: { select: { code: true } } } } } });
    if (!reviewer || reviewer.status !== UserStatus.ACTIVE || reviewer.deletedAt || !reviewer.roles.some(({ role }) => role.code === 'ADMIN')) throw new ForbiddenException('Administrator access required');
    return this.prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT "id" FROM "IdentityVerification" WHERE "id" = ${id} FOR UPDATE`;
      const verification = await transaction.identityVerification.findUnique({ where: { id } });
      if (!verification) throw new NotFoundException('Identity verification not found');
      if (([IdentityVerificationStatus.VERIFIED, IdentityVerificationStatus.REJECTED] as IdentityVerificationStatus[]).includes(verification.status)) {
        if (verification.status === input.status) return verification;
        throw new ConflictException('Identity verification has already been completed');
      }
      const updated = await transaction.identityVerification.update({ where: { id }, data: { status: input.status, completedAt: new Date(), rejectionReason: input.status === IdentityVerificationStatus.REJECTED ? input.rejectionReason : null, failureReason: null } });
      await transaction.auditLog.create({ data: { actorUserId: reviewerUserId, entityType: 'IdentityVerification', entityId: id, action: input.status === IdentityVerificationStatus.VERIFIED ? 'IDENTITY_VERIFIED' : 'IDENTITY_REJECTED', metadata: input.rejectionReason ? { reason: input.rejectionReason } : undefined } });
      return updated;
    });
  }
}
