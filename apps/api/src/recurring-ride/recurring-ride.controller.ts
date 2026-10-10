import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import { RoleCode } from '@prisma/client';
import type { Request } from 'express';
import { RequireRoles } from '../auth/require-roles.decorator';
import type { AuthenticatedRequest } from '../auth/auth.types';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { RecurringRideService } from './recurring-ride.service';
import { recurringRideCancelSchema, recurringRideCreateSchema, type RecurringRideCancelInput, type RecurringRideCreateInput } from './recurring-ride.schemas';

@Controller('recurring-rides')
@RequireRoles(RoleCode.CUSTOMER)
export class RecurringRideController {
  constructor(private readonly recurringRides: RecurringRideService) {}

  @Post()
  create(@Req() request: Request & AuthenticatedRequest, @Body(new ZodValidationPipe(recurringRideCreateSchema)) body: RecurringRideCreateInput) { return this.recurringRides.create(request.user.sub, body); }

  @Get()
  list(@Req() request: Request & AuthenticatedRequest) { return this.recurringRides.list(request.user.sub); }

  @Post(':recurringRideId/cancel')
  cancel(@Param('recurringRideId') recurringRideId: string, @Req() request: Request & AuthenticatedRequest, @Body(new ZodValidationPipe(recurringRideCancelSchema)) body: RecurringRideCancelInput) { return this.recurringRides.cancel(recurringRideId, request.user.sub, body); }
}
