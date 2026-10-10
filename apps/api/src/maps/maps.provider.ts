import type { Coordinate, DistanceResult, EtaResult, GeocodedLocation, RouteResult } from './maps.types';

export interface MapsProvider {
  geocode(address: string): Promise<GeocodedLocation | null>;
  reverseGeocode(coordinate: Coordinate): Promise<GeocodedLocation | null>;
  calculateRoute(origin: Coordinate, destination: Coordinate): Promise<RouteResult>;
  calculateDistance(origin: Coordinate, destination: Coordinate): Promise<DistanceResult>;
  calculateEta(origin: Coordinate, destination: Coordinate, departureAt?: Date): Promise<EtaResult>;
}

export class MapsProviderError extends Error {
  constructor(message: string, public readonly providerStatus?: string) {
    super(message);
    this.name = 'MapsProviderError';
  }
}
