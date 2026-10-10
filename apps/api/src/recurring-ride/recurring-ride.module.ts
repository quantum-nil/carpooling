import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { RideModule } from '../ride/ride.module';
import { RecurringRideController } from './recurring-ride.controller';
import { RecurringRideProcessor } from './recurring-ride.processor';
import { RecurringRideQueueService } from './recurring-ride-queue.service';
import { RecurringRideService } from './recurring-ride.service';

@Module({
  imports: [ConfigModule, PrismaModule, RideModule],
  controllers: [RecurringRideController],
  providers: [RecurringRideService, RecurringRideQueueService, RecurringRideProcessor],
  exports: [RecurringRideService],
})
export class RecurringRideModule {}
