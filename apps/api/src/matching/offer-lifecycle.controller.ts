import { Controller, Get, Param, Post, Req } from '@nestjs/common';
import { RoleCode } from '@prisma/client';
import type { Request } from 'express';
import { RequireRoles } from '../auth/require-roles.decorator';
import type { AuthenticatedRequest } from '../auth/auth.types';
import { OfferLifecycleService } from './offer-lifecycle.service';

@Controller('driver/offers')
export class OfferLifecycleController {
  constructor(private readonly offers: OfferLifecycleService) {}

  @Get()
  @RequireRoles(RoleCode.EMPLOYEE)
  list(@Req() request: Request & AuthenticatedRequest) {
    return this.offers.listOffers(request.user.sub);
  }

  @Get(':offerId')
  @RequireRoles(RoleCode.EMPLOYEE)
  get(@Param('offerId') offerId: string, @Req() request: Request & AuthenticatedRequest) {
    return this.offers.getOffer(offerId, request.user.sub);
  }

  @Post(':offerId/accept')
  @RequireRoles(RoleCode.EMPLOYEE)
  accept(@Param('offerId') offerId: string, @Req() request: Request & AuthenticatedRequest) {
    return this.offers.acceptOffer(offerId, request.user.sub);
  }

  @Post(':offerId/reject')
  @RequireRoles(RoleCode.EMPLOYEE)
  reject(@Param('offerId') offerId: string, @Req() request: Request & AuthenticatedRequest) {
    return this.offers.rejectOffer(offerId, request.user.sub);
  }
}
