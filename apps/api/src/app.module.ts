import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { validateEnv } from './config/env';
import { AuthModule } from './auth/auth.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProfileModule } from './profile/profile.module';
import { EmployeeModule } from './employee/employee.module';
import { VehicleModule } from './vehicle/vehicle.module';
import { CustomerModule } from './customer/customer.module';
import { RideModule } from './ride/ride.module';
import { MapsModule } from './maps/maps.module';
import { RedisModule } from './redis/redis.module';
import { DriverLocationModule } from './driver-location/driver-location.module';
import { MatchingModule } from './matching/matching.module';
import { RealtimeModule } from './realtime/realtime.module';
import { NotificationModule } from './notification/notification.module';
import { WalletModule } from './wallet/wallet.module';
import { PaymentModule } from './payment/payment.module';
import { RatingModule } from './rating/rating.module';
import { RecurringRideModule } from './recurring-ride/recurring-ride.module';
import { DocumentModule } from './document/document.module';
import { IdentityVerificationModule } from './identity-verification/identity-verification.module';
import { CallingModule } from './calling/calling.module';
import { LoyaltyModule } from './loyalty/loyalty.module';
import { AiModule } from './ai/ai.module';
import { AdminModule } from './admin/admin.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    PrismaModule,
    AuthModule,
    ProfileModule,
    EmployeeModule,
    VehicleModule,
    CustomerModule,
    RideModule,
    MapsModule,
    RedisModule,
    DriverLocationModule,
    MatchingModule,
    RealtimeModule,
    NotificationModule,
    WalletModule,
    PaymentModule,
    RatingModule,
    RecurringRideModule,
    DocumentModule,
    IdentityVerificationModule,
    CallingModule,
    LoyaltyModule,
    AiModule,
    AdminModule,
  ],
  controllers: [AppController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
