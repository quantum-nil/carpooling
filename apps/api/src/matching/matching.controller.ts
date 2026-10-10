import { Controller, Param, Post } from '@nestjs/common';
import { RoleCode } from '@prisma/client';
import { RequireRoles } from '../auth/require-roles.decorator';
import { MatchingService } from './matching.service';

@Controller('matching')
export class MatchingController {
  constructor(private readonly matching: MatchingService) {}

  @Post('rides/:rideId')
  @RequireRoles(RoleCode.ADMIN)
  match(@Param('rideId') rideId: string) {
    return this.matching.matchRide(rideId);
  }
}
