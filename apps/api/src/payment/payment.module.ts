import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { PaymentController } from './payment.controller';
import { PaymentService } from './payment.service';
import { RazorpayProvider } from './razorpay.provider';
import { PAYMENT_PROVIDER } from './payment.types';

@Module({
  imports: [ConfigModule, PrismaModule],
  controllers: [PaymentController],
  providers: [PaymentService, RazorpayProvider, { provide: PAYMENT_PROVIDER, useExisting: RazorpayProvider }],
  exports: [PaymentService],
})
export class PaymentModule {}
