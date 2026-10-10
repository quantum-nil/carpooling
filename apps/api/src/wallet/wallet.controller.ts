import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import { RoleCode } from '@prisma/client';
import type { Request } from 'express';
import { RequireRoles } from '../auth/require-roles.decorator';
import type { AuthenticatedRequest } from '../auth/auth.types';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { walletMutationSchema, walletRefundSchema, type WalletMutationInput, type WalletRefundInput } from './wallet.schemas';
import { WalletService } from './wallet.service';

@Controller('wallet')
export class WalletController {
  constructor(private readonly wallets: WalletService) {}

  @Get()
  @RequireRoles(RoleCode.ADMIN, RoleCode.EMPLOYEE, RoleCode.CUSTOMER)
  get(@Req() request: Request & AuthenticatedRequest) { return this.wallets.getWallet(request.user.sub); }

  @Get('transactions')
  @RequireRoles(RoleCode.ADMIN, RoleCode.EMPLOYEE, RoleCode.CUSTOMER)
  history(@Req() request: Request & AuthenticatedRequest) { return this.wallets.history(request.user.sub); }

  @Post(':userId/credit')
  @RequireRoles(RoleCode.ADMIN)
  credit(@Param('userId') userId: string, @Req() request: Request & AuthenticatedRequest, @Body(new ZodValidationPipe(walletMutationSchema)) body: WalletMutationInput) { return this.wallets.credit(userId, body, request.user.sub); }

  @Post(':userId/debit')
  @RequireRoles(RoleCode.ADMIN)
  debit(@Param('userId') userId: string, @Req() request: Request & AuthenticatedRequest, @Body(new ZodValidationPipe(walletMutationSchema)) body: WalletMutationInput) { return this.wallets.debit(userId, body, request.user.sub); }

  @Post(':userId/refund')
  @RequireRoles(RoleCode.ADMIN)
  refund(@Param('userId') userId: string, @Req() request: Request & AuthenticatedRequest, @Body(new ZodValidationPipe(walletRefundSchema)) body: WalletRefundInput) { return this.wallets.refund(userId, body, request.user.sub); }
}
