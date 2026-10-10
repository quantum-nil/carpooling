import { IdentityVerificationStatus } from '@prisma/client';

export interface IdentityVerificationRequest {
  verificationId: string;
  userId: string;
}

export interface IdentityVerificationProviderResult {
  provider: string;
  providerReference?: string;
  status: IdentityVerificationStatus;
}

export interface IdentityVerificationProvider {
  requestVerification(input: IdentityVerificationRequest): Promise<IdentityVerificationProviderResult>;
}

export const IDENTITY_VERIFICATION_PROVIDER = Symbol('IDENTITY_VERIFICATION_PROVIDER');
export const MANUAL_IDENTITY_PROVIDER_NAME = 'MANUAL_REVIEW';
