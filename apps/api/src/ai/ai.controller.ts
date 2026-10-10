import { Body, Controller, Post, UsePipes } from '@nestjs/common';
import { RoleCode } from '@prisma/client';
import { RequireRoles } from '../auth/require-roles.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { assistantRequestSchema, type AssistantRequestInput } from './ai.schemas';
import { AiService } from './ai.service';

@Controller('ai')
export class AiController {
  constructor(private readonly ai: AiService) {}

  @Post('ride-intent')
  @RequireRoles(RoleCode.ADMIN, RoleCode.EMPLOYEE, RoleCode.CUSTOMER)
  @UsePipes(new ZodValidationPipe(assistantRequestSchema))
  intent(@Body() body: AssistantRequestInput) { return this.ai.extractRideIntent(body.message); }

  @Post('ride-recommendations')
  @RequireRoles(RoleCode.ADMIN, RoleCode.EMPLOYEE, RoleCode.CUSTOMER)
  @UsePipes(new ZodValidationPipe(assistantRequestSchema))
  recommendations(@Body() body: AssistantRequestInput) { return this.ai.recommendRides(body.message); }
}
