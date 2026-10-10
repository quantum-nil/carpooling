import { Body, Controller, Get, Param, Patch, Post, Req, UsePipes } from '@nestjs/common';
import { RoleCode } from '@prisma/client';
import type { Request } from 'express';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { RequireRoles } from '../auth/require-roles.decorator';
import type { AuthenticatedRequest } from '../auth/auth.types';
import { EmployeeService } from './employee.service';
import {
  availabilitySchema,
  driverDocumentCreateSchema,
  driverDocumentStatusSchema,
  driverReviewSchema,
  driverStatusSchema,
  employeeCreateSchema,
  employeeStatusSchema,
  type AvailabilityInput,
  type DriverDocumentCreateInput,
  type DriverDocumentStatusInput,
  type DriverReviewInput,
  type DriverStatusInput,
  type EmployeeCreateInput,
  type EmployeeStatusInput,
} from './employee.schemas';

@Controller('employees')
export class EmployeeController {
  constructor(private readonly employees: EmployeeService) {}

  @Post()
  @RequireRoles(RoleCode.ADMIN)
  @UsePipes(new ZodValidationPipe(employeeCreateSchema))
  create(@Req() request: Request & AuthenticatedRequest, @Body() body: EmployeeCreateInput) {
    return this.employees.createEmployee(body, request.user.sub);
  }

  @Get('me')
  @RequireRoles(RoleCode.EMPLOYEE)
  getOwn(@Req() request: Request & AuthenticatedRequest) {
    return this.employees.getOwnEmployee(request.user.sub);
  }

  @Patch('me/availability')
  @RequireRoles(RoleCode.EMPLOYEE)
  @UsePipes(new ZodValidationPipe(availabilitySchema))
  updateAvailability(@Req() request: Request & AuthenticatedRequest, @Body() body: AvailabilityInput) {
    return this.employees.updateOwnAvailability(request.user.sub, body);
  }

  @Get('me/documents')
  @RequireRoles(RoleCode.EMPLOYEE)
  async getOwnDocuments(@Req() request: Request & AuthenticatedRequest) {
    const employee = await this.employees.getOwnEmployee(request.user.sub);
    return employee.documents;
  }

  @Post('me/documents')
  @RequireRoles(RoleCode.EMPLOYEE)
  @UsePipes(new ZodValidationPipe(driverDocumentCreateSchema))
  async createOwnDocument(@Req() request: Request & AuthenticatedRequest, @Body() body: DriverDocumentCreateInput) {
    const employee = await this.employees.getOwnEmployee(request.user.sub);
    return this.employees.createDocument(employee.id, body, request.user.sub);
  }

  @Get(':employeeId')
  @RequireRoles(RoleCode.ADMIN)
  get(@Param('employeeId') employeeId: string) {
    return this.employees.getEmployee(employeeId);
  }

  @Patch(':employeeId/status')
  @RequireRoles(RoleCode.ADMIN)
  updateStatus(@Req() request: Request & AuthenticatedRequest, @Param('employeeId') employeeId: string, @Body(new ZodValidationPipe(employeeStatusSchema)) body: EmployeeStatusInput) {
    return this.employees.setEmployeeStatus(employeeId, body, request.user.sub);
  }

  @Patch(':employeeId/driver-status')
  @RequireRoles(RoleCode.ADMIN)
  updateDriverStatus(@Req() request: Request & AuthenticatedRequest, @Param('employeeId') employeeId: string, @Body(new ZodValidationPipe(driverStatusSchema)) body: DriverStatusInput) {
    return this.employees.setDriverStatus(employeeId, body, request.user.sub);
  }

  @Post(':employeeId/driver-review')
  @RequireRoles(RoleCode.ADMIN)
  reviewDriver(@Req() request: Request & AuthenticatedRequest, @Param('employeeId') employeeId: string, @Body(new ZodValidationPipe(driverReviewSchema)) body: DriverReviewInput) {
    return this.employees.reviewDriver(employeeId, body, request.user.sub);
  }

  @Get(':employeeId/documents')
  @RequireRoles(RoleCode.ADMIN)
  getDocuments(@Param('employeeId') employeeId: string) {
    return this.employees.listDocuments(employeeId);
  }

  @Post(':employeeId/documents')
  @RequireRoles(RoleCode.ADMIN)
  createDocument(@Req() request: Request & AuthenticatedRequest, @Param('employeeId') employeeId: string, @Body(new ZodValidationPipe(driverDocumentCreateSchema)) body: DriverDocumentCreateInput) {
    return this.employees.createDocument(employeeId, body, request.user.sub);
  }

  @Patch(':employeeId/documents/:documentId/status')
  @RequireRoles(RoleCode.ADMIN)
  updateDocumentStatus(@Req() request: Request & AuthenticatedRequest, @Param('documentId') documentId: string, @Body(new ZodValidationPipe(driverDocumentStatusSchema)) body: DriverDocumentStatusInput) {
    return this.employees.updateDocumentStatus(documentId, body, request.user.sub);
  }
}
