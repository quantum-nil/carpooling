import { Body, Controller, Get, Param, Patch, Post, Req } from '@nestjs/common';
import { RoleCode } from '@prisma/client';
import type { Request } from 'express';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { RequireRoles } from '../auth/require-roles.decorator';
import type { AuthenticatedRequest } from '../auth/auth.types';
import { RideService } from './ride.service';
import { rideAssignmentSchema, rideCreateSchema, rideTransitionSchema, type RideAssignmentInput, type RideCreateInput, type RideTransitionInput } from './ride.schemas';

@Controller('rides')
export class RideController {
  constructor(private readonly rides: RideService) {}

  @Post()
  @RequireRoles(RoleCode.CUSTOMER)
  create(@Req() request: Request & AuthenticatedRequest, @Body(new ZodValidationPipe(rideCreateSchema)) body: RideCreateInput) {
    return this.rides.createRide(request.user.sub, body);
  }

  @Post('requests')
  @RequireRoles(RoleCode.CUSTOMER)
  createRequest(@Req() request: Request & AuthenticatedRequest, @Body(new ZodValidationPipe(rideCreateSchema)) body: RideCreateInput) {
    return this.rides.createRide(request.user.sub, body);
  }

  @Get('requests/:requestId')
  @RequireRoles(RoleCode.CUSTOMER)
  getRequest(@Param('requestId') requestId: string, @Req() request: Request & AuthenticatedRequest) {
    return this.rides.getRideRequest(requestId, request.user.sub);
  }

  @Post('requests/:requestId/cancel')
  @RequireRoles(RoleCode.CUSTOMER)
  cancelRequest(@Param('requestId') requestId: string, @Req() request: Request & AuthenticatedRequest, @Body(new ZodValidationPipe(rideTransitionSchema.pick({ cancellationReason: true }).required())) body: { cancellationReason: string }) {
    return this.rides.cancelRideRequest(requestId, request.user.sub, body.cancellationReason);
  }

  @Get('current')
  @RequireRoles(RoleCode.CUSTOMER)
  getCurrent(@Req() request: Request & AuthenticatedRequest) {
    return this.rides.getCurrentRides(request.user.sub);
  }

  @Get('history')
  @RequireRoles(RoleCode.CUSTOMER)
  getHistory(@Req() request: Request & AuthenticatedRequest) {
    return this.rides.getRideHistory(request.user.sub);
  }

  @Get('driver/current')
  @RequireRoles(RoleCode.EMPLOYEE)
  getDriverCurrent(@Req() request: Request & AuthenticatedRequest) {
    return this.rides.getDriverCurrentRides(request.user.sub);
  }

  @Get('driver/history')
  @RequireRoles(RoleCode.EMPLOYEE)
  getDriverHistory(@Req() request: Request & AuthenticatedRequest) {
    return this.rides.getDriverRideHistory(request.user.sub);
  }

  @Get(':rideId')
  @RequireRoles(RoleCode.ADMIN, RoleCode.CUSTOMER, RoleCode.EMPLOYEE)
  get(@Param('rideId') rideId: string, @Req() request: Request & AuthenticatedRequest) {
    return this.rides.getRide(rideId, request.user.sub);
  }

  @Patch(':rideId/assignment')
  @RequireRoles(RoleCode.ADMIN)
  assign(@Param('rideId') rideId: string, @Req() request: Request & AuthenticatedRequest, @Body(new ZodValidationPipe(rideAssignmentSchema)) body: RideAssignmentInput) {
    return this.rides.assignDriver(rideId, body, request.user.sub);
  }

  @Post(':rideId/transition')
  @RequireRoles(RoleCode.ADMIN, RoleCode.CUSTOMER, RoleCode.EMPLOYEE)
  transition(@Param('rideId') rideId: string, @Req() request: Request & AuthenticatedRequest, @Body(new ZodValidationPipe(rideTransitionSchema)) body: RideTransitionInput) {
    return this.rides.transitionRide(rideId, body, request.user.sub);
  }

  @Post(':rideId/requests/:requestId/accept')
  @RequireRoles(RoleCode.EMPLOYEE)
  acceptRequest(@Param('rideId') rideId: string, @Param('requestId') requestId: string, @Req() request: Request & AuthenticatedRequest) {
    return this.rides.acceptRideRequest(rideId, requestId, request.user.sub);
  }
}
