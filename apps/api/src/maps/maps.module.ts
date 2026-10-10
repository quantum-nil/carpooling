import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import type { AppEnv } from '../config/env';
import { GoogleMapsProvider } from './google-maps.provider';
import { MapsService } from './maps.service';
import { MAPS_PROVIDER } from './maps.tokens';

@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: MAPS_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppEnv>) => new GoogleMapsProvider(config.getOrThrow('GOOGLE_MAPS_API_KEY')),
    },
    MapsService,
  ],
  exports: [MapsService],
})
export class MapsModule {}
