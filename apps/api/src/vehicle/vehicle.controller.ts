import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UsePipes } from '@nestjs/common';
import { RoleCode } from '@prisma/client';
import type { Request } from 'express';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { RequireRoles } from '../auth/require-roles.decorator';
import type { AuthenticatedRequest } from '../auth/auth.types';
import { VehicleService } from './vehicle.service';
import {
  vehicleAssignmentSchema,
  vehicleCreateSchema,
  vehicleStatusSchema,
  vehicleUpdateSchema,
  type VehicleAssignmentInput,
  type VehicleCreateInput,
  type VehicleStatusInput,
  type VehicleUpdateInput,
} from './vehicle.schemas';

@Controller('vehicles')
export class VehicleController {
  constructor(private readonly vehicles: VehicleService) {}

  @Post()
  @RequireRoles(RoleCode.ADMIN)
  @UsePipes(new ZodValidationPipe(vehicleCreateSchema))
  create(@Req() request: Request & AuthenticatedRequest, @Body() body: VehicleCreateInput) {
    return this.vehicles.createVehicle(body, request.user.sub);
  }

  @Get('me')
  @RequireRoles(RoleCode.EMPLOYEE)
  listAssigned(@Req() request: Request & AuthenticatedRequest) {
    return this.vehicles.listAssignedVehicles(request.user.sub);
  }

  @Get(':vehicleId')
  @RequireRoles(RoleCode.ADMIN, RoleCode.EMPLOYEE)
  get(@Param('vehicleId') vehicleId: string, @Req() request: Request & AuthenticatedRequest) {
    return this.vehicles.getVehicle(vehicleId, request.user.sub);
  }

  @Patch(':vehicleId')
  @RequireRoles(RoleCode.ADMIN, RoleCode.EMPLOYEE)
  update(@Param('vehicleId') vehicleId: string, @Req() request: Request & AuthenticatedRequest, @Body(new ZodValidationPipe(vehicleUpdateSchema)) body: VehicleUpdateInput) {
    return this.vehicles.updateVehicle(vehicleId, body, request.user.sub);
  }

  @Patch(':vehicleId/status')
  @RequireRoles(RoleCode.ADMIN, RoleCode.EMPLOYEE)
  updateStatus(@Param('vehicleId') vehicleId: string, @Req() request: Request & AuthenticatedRequest, @Body(new ZodValidationPipe(vehicleStatusSchema)) body: VehicleStatusInput) {
    return this.vehicles.updateStatus(vehicleId, body, request.user.sub);
  }

  @Delete(':vehicleId')
  @RequireRoles(RoleCode.ADMIN, RoleCode.EMPLOYEE)
  remove(@Param('vehicleId') vehicleId: string, @Req() request: Request & AuthenticatedRequest) {
    return this.vehicles.removeVehicle(vehicleId, request.user.sub);
  }

  @Patch(':vehicleId/assignment')
  @RequireRoles(RoleCode.ADMIN)
  assign(@Param('vehicleId') vehicleId: string, @Req() request: Request & AuthenticatedRequest, @Body(new ZodValidationPipe(vehicleAssignmentSchema)) body: VehicleAssignmentInput) {
    return this.vehicles.assignVehicle(vehicleId, body, request.user.sub);
  }
}
