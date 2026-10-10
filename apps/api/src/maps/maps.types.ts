export interface Coordinate {
  latitude: number;
  longitude: number;
}

export interface GeocodedLocation {
  formattedAddress: string;
  coordinate: Coordinate;
  placeId?: string;
}

export interface RouteResult {
  distanceMeters: number;
  durationSeconds: number;
  polyline?: string;
}

export interface DistanceResult {
  distanceMeters: number;
  durationSeconds: number;
}

export interface EtaResult {
  durationSeconds: number;
  arrivalAt: Date;
}
