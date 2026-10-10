import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UsePipes } from '@nestjs/common';
import { RoleCode } from '@prisma/client';
import type { Request } from 'express';
import { RequireRoles } from '../auth/require-roles.decorator';
import type { AuthenticatedRequest } from '../auth/auth.types';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { deviceSchema, preferenceSchema, type DeviceInput, type PreferenceInput } from './notification.schemas';
import { NotificationService } from './notification.service';

@Controller('notifications')
@RequireRoles(RoleCode.ADMIN, RoleCode.EMPLOYEE, RoleCode.CUSTOMER)
export class NotificationController {
  constructor(private readonly notifications: NotificationService) {}

  @Get()
  list(@Req() request: Request & AuthenticatedRequest, @Query('unreadOnly') unreadOnly?: string) { return this.notifications.listForUser(request.user.sub, unreadOnly === 'true'); }

  @Patch(':notificationId/read')
  markRead(@Req() request: Request & AuthenticatedRequest, @Param('notificationId') notificationId: string) { return this.notifications.markRead(request.user.sub, notificationId); }

  @Get('preferences')
  preferences(@Req() request: Request & AuthenticatedRequest) { return this.notifications.getPreferences(request.user.sub); }

  @Patch('preferences')
  @UsePipes(new ZodValidationPipe(preferenceSchema))
  preference(@Req() request: Request & AuthenticatedRequest, @Body() body: PreferenceInput) { return this.notifications.setPreference(request.user.sub, body); }

  @Post('devices')
  @UsePipes(new ZodValidationPipe(deviceSchema))
  registerDevice(@Req() request: Request & AuthenticatedRequest, @Body() body: DeviceInput) { return this.notifications.registerDevice(request.user.sub, body); }

  @Delete('devices/:token')
  unregisterDevice(@Req() request: Request & AuthenticatedRequest, @Param('token') token: string) { return this.notifications.unregisterDevice(request.user.sub, token); }
}
