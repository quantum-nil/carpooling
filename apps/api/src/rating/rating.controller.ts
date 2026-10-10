import { Body, Controller, Get, Param, Patch, Post, Req } from '@nestjs/common';
import { RoleCode } from '@prisma/client';
import type { Request } from 'express';
import { RequireRoles } from '../auth/require-roles.decorator';
import type { AuthenticatedRequest } from '../auth/auth.types';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { createRatingSchema, reportRatingSchema, reviewReportSchema, type CreateRatingInput, type ReportRatingInput, type ReviewReportInput } from './rating.schemas';
import { RatingService } from './rating.service';

@Controller('ratings')
export class RatingController {
  constructor(private readonly ratings: RatingService) {}

  @Post('rides/:rideId')
  @RequireRoles(RoleCode.CUSTOMER, RoleCode.EMPLOYEE)
  create(@Param('rideId') rideId: string, @Req() request: Request & AuthenticatedRequest, @Body(new ZodValidationPipe(createRatingSchema)) body: CreateRatingInput) { return this.ratings.createRating(rideId, request.user.sub, body); }

  @Get('rides/:rideId')
  @RequireRoles(RoleCode.ADMIN, RoleCode.CUSTOMER, RoleCode.EMPLOYEE)
  getRideRatings(@Param('rideId') rideId: string, @Req() request: Request & AuthenticatedRequest) { return this.ratings.getRideRatings(rideId, request.user.sub); }

  @Get('users/:userId/summary')
  @RequireRoles(RoleCode.ADMIN, RoleCode.CUSTOMER, RoleCode.EMPLOYEE)
  summary(@Param('userId') userId: string) { return this.ratings.getSummary(userId); }

  @Get('users/:userId')
  @RequireRoles(RoleCode.ADMIN, RoleCode.CUSTOMER, RoleCode.EMPLOYEE)
  reviews(@Param('userId') userId: string) { return this.ratings.getReviews(userId); }

  @Post(':ratingId/reports')
  @RequireRoles(RoleCode.ADMIN, RoleCode.CUSTOMER, RoleCode.EMPLOYEE)
  report(@Param('ratingId') ratingId: string, @Req() request: Request & AuthenticatedRequest, @Body(new ZodValidationPipe(reportRatingSchema)) body: ReportRatingInput) { return this.ratings.reportRating(ratingId, request.user.sub, body); }

  @Patch('reports/:reportId')
  @RequireRoles(RoleCode.ADMIN)
  reviewReport(@Param('reportId') reportId: string, @Req() request: Request & AuthenticatedRequest, @Body(new ZodValidationPipe(reviewReportSchema)) body: ReviewReportInput) { return this.ratings.reviewReport(reportId, request.user.sub, body); }
}
