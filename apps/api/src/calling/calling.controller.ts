import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import { RoleCode } from '@prisma/client';
import type { Request } from 'express';
import { RequireRoles } from '../auth/require-roles.decorator';
import type { AuthenticatedRequest } from '../auth/auth.types';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CallingService } from './calling.service';
import { initiateCallSchema, type InitiateCallInput } from './calling.schemas';

@Controller('calls')
export class CallingController {
  constructor(private readonly calls: CallingService) {}

  @Post('rides/:rideId')
  @RequireRoles(RoleCode.ADMIN, RoleCode.EMPLOYEE, RoleCode.CUSTOMER)
  initiate(@Param('rideId') rideId: string, @Req() request: Request & AuthenticatedRequest, @Body(new ZodValidationPipe(initiateCallSchema)) body: InitiateCallInput) {
    return this.calls.initiate(rideId, request.user.sub, body);
  }

  @Get(':callId/status')
  @RequireRoles(RoleCode.ADMIN, RoleCode.EMPLOYEE, RoleCode.CUSTOMER)
  getStatus(@Param('callId') callId: string, @Req() request: Request & AuthenticatedRequest) {
    return this.calls.getStatus(callId, request.user.sub);
  }
}
