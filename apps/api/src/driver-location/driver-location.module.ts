import { Module } from '@nestjs/common';
import { DriverLocationController } from './driver-location.controller';
import { DriverLocationService } from './driver-location.service';

@Module({ controllers: [DriverLocationController], providers: [DriverLocationService], exports: [DriverLocationService] })
export class DriverLocationModule {}
