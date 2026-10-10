import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { IDENTITY_VERIFICATION_PROVIDER } from './identity-verification.types';
import { IdentityVerificationController } from './identity-verification.controller';
import { IdentityVerificationService } from './identity-verification.service';
import { ManualIdentityVerificationProvider } from './manual-identity.provider';

@Module({
  imports: [PrismaModule],
  controllers: [IdentityVerificationController],
  providers: [IdentityVerificationService, ManualIdentityVerificationProvider, { provide: IDENTITY_VERIFICATION_PROVIDER, useExisting: ManualIdentityVerificationProvider }],
  exports: [IdentityVerificationService],
})
export class IdentityVerificationModule {}
