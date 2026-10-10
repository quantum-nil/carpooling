import { Inject, Injectable } from '@nestjs/common';
import { MAPS_PROVIDER } from './maps.tokens';
import type { MapsProvider } from './maps.provider';
import type { Coordinate, DistanceResult, EtaResult, GeocodedLocation, RouteResult } from './maps.types';

@Injectable()
export class MapsService {
  constructor(@Inject(MAPS_PROVIDER) private readonly provider: MapsProvider) {}

  geocode(address: string): Promise<GeocodedLocation | null> {
    return this.provider.geocode(address);
  }

  reverseGeocode(coordinate: Coordinate): Promise<GeocodedLocation | null> {
    return this.provider.reverseGeocode(coordinate);
  }

  calculateRoute(origin: Coordinate, destination: Coordinate): Promise<RouteResult> {
    return this.provider.calculateRoute(origin, destination);
  }

  calculateDistance(origin: Coordinate, destination: Coordinate): Promise<DistanceResult> {
    return this.provider.calculateDistance(origin, destination);
  }

  calculateEta(origin: Coordinate, destination: Coordinate, departureAt?: Date): Promise<EtaResult> {
    return this.provider.calculateEta(origin, destination, departureAt);
  }
}
