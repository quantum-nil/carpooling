import { Body, Controller, Get, Param, Post, Req, UsePipes } from '@nestjs/common';
import { RoleCode } from '@prisma/client';
import type { Request } from 'express';
import { RequireRoles } from '../auth/require-roles.decorator';
import type { AuthenticatedRequest } from '../auth/auth.types';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { earnPointsSchema, earningRuleSchema, redeemPointsSchema, redemptionRuleSchema, type EarnPointsInput, type EarningRuleInput, type RedeemPointsInput, type RedemptionRuleInput } from './loyalty.schemas';
import { LoyaltyService } from './loyalty.service';

@Controller('loyalty')
export class LoyaltyController {
  constructor(private readonly loyalty: LoyaltyService) {}

  @Get()
  @RequireRoles(RoleCode.ADMIN, RoleCode.EMPLOYEE, RoleCode.CUSTOMER)
  account(@Req() request: Request & AuthenticatedRequest) { return this.loyalty.getAccount(request.user.sub); }

  @Get('transactions')
  @RequireRoles(RoleCode.ADMIN, RoleCode.EMPLOYEE, RoleCode.CUSTOMER)
  history(@Req() request: Request & AuthenticatedRequest) { return this.loyalty.history(request.user.sub); }

  @Get('rules/earning')
  @RequireRoles(RoleCode.ADMIN, RoleCode.EMPLOYEE, RoleCode.CUSTOMER)
  earningRules() { return this.loyalty.listEarningRules(); }

  @Get('rules/redemption')
  @RequireRoles(RoleCode.ADMIN, RoleCode.EMPLOYEE, RoleCode.CUSTOMER)
  redemptionRules() { return this.loyalty.listRedemptionRules(); }

  @Post('earn/:userId')
  @RequireRoles(RoleCode.ADMIN)
  earn(@Param('userId') userId: string, @Req() request: Request & AuthenticatedRequest, @Body(new ZodValidationPipe(earnPointsSchema)) body: EarnPointsInput) { return this.loyalty.earn(userId, body, request.user.sub); }

  @Post('redeem')
  @RequireRoles(RoleCode.CUSTOMER, RoleCode.EMPLOYEE)
  @UsePipes(new ZodValidationPipe(redeemPointsSchema))
  redeem(@Req() request: Request & AuthenticatedRequest, @Body() body: RedeemPointsInput) { return this.loyalty.redeem(request.user.sub, body); }

  @Post('rules/earning')
  @RequireRoles(RoleCode.ADMIN)
  @UsePipes(new ZodValidationPipe(earningRuleSchema))
  createEarningRule(@Body() body: EarningRuleInput) { return this.loyalty.createEarningRule(body); }

  @Post('rules/redemption')
  @RequireRoles(RoleCode.ADMIN)
  @UsePipes(new ZodValidationPipe(redemptionRuleSchema))
  createRedemptionRule(@Body() body: RedemptionRuleInput) { return this.loyalty.createRedemptionRule(body); }
}
