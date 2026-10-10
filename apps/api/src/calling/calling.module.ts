import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { CallingController } from './calling.controller';
import { CallingService } from './calling.service';
import { ExotelCallingProvider } from './exotel.provider';
import { CALLING_PROVIDER } from './calling.types';

@Module({
  imports: [ConfigModule, PrismaModule],
  controllers: [CallingController],
  providers: [CallingService, ExotelCallingProvider, { provide: CALLING_PROVIDER, useExisting: ExotelCallingProvider }],
  exports: [CallingService],
})
export class CallingModule {}
