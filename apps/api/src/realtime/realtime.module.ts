import { Global, Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DriverLocationModule } from '../driver-location/driver-location.module';
import { MatchingModule } from '../matching/matching.module';
import { PrismaModule } from '../prisma/prisma.module';
import { RideModule } from '../ride/ride.module';
import { ChatModule } from '../chat/chat.module';
import { RealtimeEventService } from './realtime-event.service';
import { RealtimeGateway } from './realtime.gateway';

@Global()
@Module({
  imports: [AuthModule, PrismaModule, RideModule, MatchingModule, DriverLocationModule, ChatModule],
  providers: [RealtimeEventService, RealtimeGateway],
  exports: [RealtimeEventService],
})
export class RealtimeModule {}
