import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UsePipes } from '@nestjs/common';
import { RoleCode } from '@prisma/client';
import type { Request } from 'express';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { RequireRoles } from '../auth/require-roles.decorator';
import type { AuthenticatedRequest } from '../auth/auth.types';
import { CustomerService } from './customer.service';
import {
  customerProfileUpdateSchema,
  customerStatusSchema,
  savedLocationCreateSchema,
  savedLocationUpdateSchema,
  type CustomerProfileUpdateInput,
  type CustomerStatusInput,
  type SavedLocationCreateInput,
  type SavedLocationUpdateInput,
} from './customer.schemas';

@Controller('customers')
export class CustomerController {
  constructor(private readonly customers: CustomerService) {}

  @Get('me')
  @RequireRoles(RoleCode.CUSTOMER)
  getOwn(@Req() request: Request & AuthenticatedRequest) {
    return this.customers.getOwnProfile(request.user.sub);
  }

  @Patch('me')
  @RequireRoles(RoleCode.CUSTOMER)
  @UsePipes(new ZodValidationPipe(customerProfileUpdateSchema))
  updateOwn(@Req() request: Request & AuthenticatedRequest, @Body() body: CustomerProfileUpdateInput) {
    return this.customers.updateOwnProfile(request.user.sub, body);
  }

  @Get('me/locations')
  @RequireRoles(RoleCode.CUSTOMER)
  listLocations(@Req() request: Request & AuthenticatedRequest) {
    return this.customers.listOwnLocations(request.user.sub);
  }

  @Post('me/locations')
  @RequireRoles(RoleCode.CUSTOMER)
  @UsePipes(new ZodValidationPipe(savedLocationCreateSchema))
  createLocation(@Req() request: Request & AuthenticatedRequest, @Body() body: SavedLocationCreateInput) {
    return this.customers.createOwnLocation(request.user.sub, body);
  }

  @Patch('me/locations/:locationId')
  @RequireRoles(RoleCode.CUSTOMER)
  updateLocation(@Req() request: Request & AuthenticatedRequest, @Param('locationId') locationId: string, @Body(new ZodValidationPipe(savedLocationUpdateSchema)) body: SavedLocationUpdateInput) {
    return this.customers.updateOwnLocation(request.user.sub, locationId, body);
  }

  @Delete('me/locations/:locationId')
  @RequireRoles(RoleCode.CUSTOMER)
  removeLocation(@Req() request: Request & AuthenticatedRequest, @Param('locationId') locationId: string) {
    return this.customers.removeOwnLocation(request.user.sub, locationId);
  }

  @Get()
  @RequireRoles(RoleCode.ADMIN)
  listCustomers() {
    return this.customers.listCustomers();
  }

  @Get(':customerId')
  @RequireRoles(RoleCode.ADMIN)
  getCustomer(@Param('customerId') customerId: string) {
    return this.customers.getCustomer(customerId);
  }

  @Patch(':customerId/status')
  @RequireRoles(RoleCode.ADMIN)
  updateStatus(@Req() request: Request & AuthenticatedRequest, @Param('customerId') customerId: string, @Body(new ZodValidationPipe(customerStatusSchema)) body: CustomerStatusInput) {
    return this.customers.updateStatus(customerId, body, request.user.sub);
  }
}
