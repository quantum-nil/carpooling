import { ForbiddenException } from '@nestjs/common';
import { IdentityVerificationStatus } from '@prisma/client';
import { IdentityVerificationService } from './identity-verification.service';

const userId = '00000000-0000-0000-0000-000000000001';
const verification = { id: 'verification', userId, provider: 'MANUAL_REVIEW', providerReference: 'manual:verification', status: IdentityVerificationStatus.PENDING, requestedAt: new Date(), completedAt: null, rejectionReason: null, failureReason: null, createdAt: new Date(), updatedAt: new Date() };

function provider() { return { requestVerification: jest.fn().mockResolvedValue({ provider: 'MANUAL_REVIEW', providerReference: 'manual:verification', status: IdentityVerificationStatus.PENDING }) }; }

describe('IdentityVerificationService', () => {
  it('creates a pending verification through the provider abstraction', async () => {
    const identityProvider = provider();
    const prisma = { user: { findUnique: jest.fn().mockResolvedValue({ status: 'ACTIVE', deletedAt: null }) }, identityVerification: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ ...verification, status: IdentityVerificationStatus.REQUESTED }) }, $transaction: jest.fn((callback: (transaction: unknown) => unknown) => callback({ identityVerification: { update: jest.fn().mockResolvedValue(verification) } })) };
    const service = new IdentityVerificationService(prisma as never, identityProvider as never);

    const result = await service.request(userId);

    expect(identityProvider.requestVerification).toHaveBeenCalledWith({ verificationId: 'verification', userId });
    expect(result.status).toBe(IdentityVerificationStatus.PENDING);
  });

  it('records provider failures without storing identity payloads', async () => {
    const identityProvider = provider();
    identityProvider.requestVerification.mockRejectedValue(new Error('provider unavailable'));
    const update = jest.fn().mockResolvedValue({ ...verification, status: IdentityVerificationStatus.FAILED });
    const prisma = { user: { findUnique: jest.fn().mockResolvedValue({ status: 'ACTIVE', deletedAt: null }) }, identityVerification: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ ...verification, status: IdentityVerificationStatus.REQUESTED }), update } };
    const service = new IdentityVerificationService(prisma as never, identityProvider as never);

    const result = await service.request(userId);

    expect(result.status).toBe(IdentityVerificationStatus.FAILED);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ failureReason: 'provider unavailable' }) }));
  });

  it('rejects review by a non-admin', async () => {
    const prisma = { user: { findUnique: jest.fn().mockResolvedValue({ status: 'ACTIVE', deletedAt: null, roles: [{ role: { code: 'CUSTOMER' } }] }) } };
    const service = new IdentityVerificationService(prisma as never, provider() as never);

    await expect(service.review('verification', userId, { status: IdentityVerificationStatus.VERIFIED })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows admin rejection with a reason', async () => {
    const tx = { $queryRaw: jest.fn(), identityVerification: { findUnique: jest.fn().mockResolvedValue(verification), update: jest.fn().mockResolvedValue({ ...verification, status: IdentityVerificationStatus.REJECTED }) }, auditLog: { create: jest.fn() } };
    const prisma = { user: { findUnique: jest.fn().mockResolvedValue({ status: 'ACTIVE', deletedAt: null, roles: [{ role: { code: 'ADMIN' } }] }) }, $transaction: jest.fn((callback: (transaction: typeof tx) => unknown) => callback(tx)) };
    const service = new IdentityVerificationService(prisma as never, provider() as never);

    const result = await service.review('verification', 'admin', { status: IdentityVerificationStatus.REJECTED, rejectionReason: 'Unable to validate submitted details' });

    expect(result.status).toBe(IdentityVerificationStatus.REJECTED);
    expect(tx.auditLog.create).toHaveBeenCalled();
  });
});
