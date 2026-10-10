import { Body, Controller, Get, Param, Patch, Req, UseGuards, UsePipes } from '@nestjs/common';
import { RoleCode } from '@prisma/client';
import type { Request } from 'express';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { AccessTokenGuard } from '../auth/access-token.guard';
import { RequireRoles } from '../auth/require-roles.decorator';
import type { AuthenticatedRequest } from '../auth/auth.types';
import { ProfileService } from './profile.service';
import { profileUpdateSchema, type ProfileUpdateInput } from './profile.schemas';

@Controller('profile')
export class ProfileController {
  constructor(private readonly profiles: ProfileService) {}

  @Get()
  @UseGuards(AccessTokenGuard)
  getCurrentProfile(@Req() request: Request & AuthenticatedRequest) {
    return this.profiles.getProfile(request.user.sub);
  }

  @Patch()
  @UseGuards(AccessTokenGuard)
  @UsePipes(new ZodValidationPipe(profileUpdateSchema))
  updateCurrentProfile(
    @Req() request: Request & AuthenticatedRequest,
    @Body() body: ProfileUpdateInput,
  ) {
    return this.profiles.updateOwnProfile(request.user.sub, body);
  }

  @Get(':userId')
  @RequireRoles(RoleCode.ADMIN)
  getUserProfile(@Param('userId') userId: string) {
    return this.profiles.getProfile(userId);
  }

  @Patch(':userId')
  @RequireRoles(RoleCode.ADMIN)
  updateUserProfile(
    @Req() request: Request & AuthenticatedRequest,
    @Param('userId') userId: string,
    @Body(new ZodValidationPipe(profileUpdateSchema)) body: ProfileUpdateInput,
  ) {
    return this.profiles.updateProfile(request.user.sub, userId, body);
  }
}
