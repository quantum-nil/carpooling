import { BadRequestException, Body, Controller, Get, Headers, Param, Post, Req } from '@nestjs/common';
import { RoleCode } from '@prisma/client';
import type { Request } from 'express';
import { RequireRoles } from '../auth/require-roles.decorator';
import type { AuthenticatedRequest } from '../auth/auth.types';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { createPaymentSchema, refundSchema, verifyPaymentSchema, type CreatePaymentInput, type RefundInput, type VerifyPaymentInput } from './payment.schemas';
import { PaymentService } from './payment.service';

@Controller('payments')
export class PaymentController {
  constructor(private readonly payments: PaymentService) {}

  @Post('orders')
  @RequireRoles(RoleCode.ADMIN, RoleCode.EMPLOYEE, RoleCode.CUSTOMER)
  createOrder(@Req() request: Request & AuthenticatedRequest, @Body(new ZodValidationPipe(createPaymentSchema)) body: CreatePaymentInput) { return this.payments.createOrder(request.user.sub, body); }

  @Post(':paymentId/verify')
  @RequireRoles(RoleCode.ADMIN, RoleCode.EMPLOYEE, RoleCode.CUSTOMER)
  verify(@Req() request: Request & AuthenticatedRequest, @Param('paymentId') paymentId: string, @Body(new ZodValidationPipe(verifyPaymentSchema)) body: VerifyPaymentInput) { return this.payments.verifyPayment(request.user.sub, paymentId, body); }

  @Get(':paymentId')
  @RequireRoles(RoleCode.ADMIN, RoleCode.EMPLOYEE, RoleCode.CUSTOMER)
  get(@Req() request: Request & AuthenticatedRequest, @Param('paymentId') paymentId: string) { return this.payments.getPayment(request.user.sub, paymentId); }

  @Post(':paymentId/refund')
  @RequireRoles(RoleCode.ADMIN)
  refund(@Req() request: Request & AuthenticatedRequest, @Param('paymentId') paymentId: string, @Body(new ZodValidationPipe(refundSchema)) body: RefundInput) { return this.payments.refund(request.user.sub, paymentId, body); }

  @Post('webhooks/razorpay')
  webhook(@Req() request: Request & { rawBody?: Buffer }, @Headers('x-razorpay-signature') signature: string, @Headers('x-razorpay-event-id') eventId: string) {
    if (!request.rawBody || !signature || !eventId) throw new BadRequestException('Missing Razorpay webhook headers or raw body');
    return this.payments.processWebhook(request.rawBody, signature, eventId);
  }
}
