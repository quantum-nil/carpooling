import { Module } from '@nestjs/common';
import { MatchingController } from './matching.controller';
import { MatchingService } from './matching.service';
import { MapsModule } from '../maps/maps.module';
import { DriverLocationModule } from '../driver-location/driver-location.module';
import { OfferLifecycleController } from './offer-lifecycle.controller';
import { OfferLifecycleService } from './offer-lifecycle.service';
import { OfferExpirationQueueService } from './offer-expiration-queue.service';
import { OfferExpirationProcessor } from './offer-expiration.processor';

@Module({ imports: [MapsModule, DriverLocationModule], controllers: [MatchingController, OfferLifecycleController], providers: [MatchingService, OfferLifecycleService, OfferExpirationQueueService, OfferExpirationProcessor], exports: [MatchingService, OfferLifecycleService] })
export class MatchingModule {}
