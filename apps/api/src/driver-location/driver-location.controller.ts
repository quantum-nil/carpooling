import { Body, Controller, Get, Patch, Req, UsePipes } from '@nestjs/common';
import { RoleCode } from '@prisma/client';
import type { Request } from 'express';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { RequireRoles } from '../auth/require-roles.decorator';
import type { AuthenticatedRequest } from '../auth/auth.types';
import { DriverLocationService } from './driver-location.service';
import { driverLocationSchema, type DriverLocationInput } from './driver-location.schemas';

@Controller('employees/me/location')
export class DriverLocationController {
  constructor(private readonly locations: DriverLocationService) {}

  @Patch()
  @RequireRoles(RoleCode.EMPLOYEE)
  @UsePipes(new ZodValidationPipe(driverLocationSchema))
  update(@Req() request: Request & AuthenticatedRequest, @Body() body: DriverLocationInput) {
    return this.locations.updateOwnLocation(request.user.sub, body);
  }

  @Get()
  @RequireRoles(RoleCode.EMPLOYEE)
  get(@Req() request: Request & AuthenticatedRequest) {
    return this.locations.getOwnLocation(request.user.sub);
  }
}
