import { Body, Controller, Get, Param, Patch, Post, Req } from '@nestjs/common';
import { RoleCode } from '@prisma/client';
import type { Request } from 'express';
import { RequireRoles } from '../auth/require-roles.decorator';
import type { AuthenticatedRequest } from '../auth/auth.types';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { reviewIdentityVerificationSchema, type ReviewIdentityVerificationInput } from './identity-verification.schemas';
import { IdentityVerificationService } from './identity-verification.service';

@Controller('identity-verifications')
export class IdentityVerificationController {
  constructor(private readonly verifications: IdentityVerificationService) {}

  @Post()
  @RequireRoles(RoleCode.ADMIN, RoleCode.EMPLOYEE, RoleCode.CUSTOMER)
  request(@Req() request: Request & AuthenticatedRequest) { return this.verifications.request(request.user.sub); }

  @Get('me')
  @RequireRoles(RoleCode.ADMIN, RoleCode.EMPLOYEE, RoleCode.CUSTOMER)
  listMine(@Req() request: Request & AuthenticatedRequest) { return this.verifications.listForUser(request.user.sub); }

  @Patch(':verificationId/review')
  @RequireRoles(RoleCode.ADMIN)
  review(@Param('verificationId') verificationId: string, @Req() request: Request & AuthenticatedRequest, @Body(new ZodValidationPipe(reviewIdentityVerificationSchema)) body: ReviewIdentityVerificationInput) { return this.verifications.review(verificationId, request.user.sub, body); }
}
