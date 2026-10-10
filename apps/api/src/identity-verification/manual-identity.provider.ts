import { Injectable } from '@nestjs/common';
import { MANUAL_IDENTITY_PROVIDER_NAME, type IdentityVerificationProvider, type IdentityVerificationProviderResult, type IdentityVerificationRequest } from './identity-verification.types';

@Injectable()
export class ManualIdentityVerificationProvider implements IdentityVerificationProvider {
  async requestVerification(input: IdentityVerificationRequest): Promise<IdentityVerificationProviderResult> {
    return { provider: MANUAL_IDENTITY_PROVIDER_NAME, providerReference: `manual:${input.verificationId}`, status: 'PENDING' };
  }
}
