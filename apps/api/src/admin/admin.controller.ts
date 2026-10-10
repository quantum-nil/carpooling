import { Body, Controller, Get, Param, Patch, Post, Query, Req, UsePipes } from '@nestjs/common';
import { RoleCode } from '@prisma/client';
import { RequireRoles } from '../auth/require-roles.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { adminListQuerySchema, adminUserCreateSchema, adminUserStatusSchema, adminUserUpdateSchema, analyticsQuerySchema, type AdminListQuery, type AdminUserCreateInput, type AdminUserStatusInput, type AdminUserUpdateInput, type AnalyticsQuery } from './admin.schemas';
import type { Request } from 'express';
import type { AuthenticatedRequest } from '../auth/auth.types';
import { AdminService } from './admin.service';
import { AnalyticsService } from './analytics.service';

@Controller('admin')
@RequireRoles(RoleCode.ADMIN)
export class AdminController {
  constructor(private readonly admin: AdminService, private readonly analyticsService: AnalyticsService) {}

  @Get('overview') overview() { return this.admin.overview(); }
  @Post('users') @UsePipes(new ZodValidationPipe(adminUserCreateSchema)) createUser(@Req() request: Request & AuthenticatedRequest, @Body() body: AdminUserCreateInput) { return this.admin.createUser(body, request.user.sub); }
  @Patch('users/:userId') updateUser(@Param('userId') userId: string, @Req() request: Request & AuthenticatedRequest, @Body(new ZodValidationPipe(adminUserUpdateSchema)) body: AdminUserUpdateInput) { return this.admin.updateUser(userId, body, request.user.sub); }
  @Patch('users/:userId/status') updateUserStatus(@Param('userId') userId: string, @Req() request: Request & AuthenticatedRequest, @Body(new ZodValidationPipe(adminUserStatusSchema)) body: AdminUserStatusInput) { return this.admin.updateUserStatus(userId, body, request.user.sub); }
  @Get('analytics') @UsePipes(new ZodValidationPipe(analyticsQuerySchema)) analytics(@Query() query: AnalyticsQuery) { return this.analyticsService.getMetrics(query); }
  @Get('users') @UsePipes(new ZodValidationPipe(adminListQuerySchema)) users(@Query() query: AdminListQuery) { return this.admin.users(query); }
  @Get('employees') @UsePipes(new ZodValidationPipe(adminListQuerySchema)) employees(@Query() query: AdminListQuery) { return this.admin.employees(query); }
  @Get('vehicles') @UsePipes(new ZodValidationPipe(adminListQuerySchema)) vehicles(@Query() query: AdminListQuery) { return this.admin.vehicles(query); }
  @Get('rides') @UsePipes(new ZodValidationPipe(adminListQuerySchema)) rides(@Query() query: AdminListQuery) { return this.admin.rides(query); }
  @Get('payments') @UsePipes(new ZodValidationPipe(adminListQuerySchema)) payments(@Query() query: AdminListQuery) { return this.admin.payments(query); }
  @Get('wallet-transactions') @UsePipes(new ZodValidationPipe(adminListQuerySchema)) walletTransactions(@Query() query: AdminListQuery) { return this.admin.walletTransactions(query); }
  @Get('documents') @UsePipes(new ZodValidationPipe(adminListQuerySchema)) documents(@Query() query: AdminListQuery) { return this.admin.documents(query); }
  @Get('ratings') @UsePipes(new ZodValidationPipe(adminListQuerySchema)) ratings(@Query() query: AdminListQuery) { return this.admin.ratings(query); }
  @Get('audit-logs') @UsePipes(new ZodValidationPipe(adminListQuerySchema)) auditLogs(@Query() query: AdminListQuery) { return this.admin.auditLogs(query); }
}
