import { MapsProviderError, type MapsProvider } from './maps.provider';
import type { Coordinate, DistanceResult, EtaResult, GeocodedLocation, RouteResult } from './maps.types';

type GoogleFetch = typeof fetch;

interface GoogleGeocodeResponse {
  status: string;
  error_message?: string;
  results: Array<{
    formatted_address: string;
    place_id?: string;
    geometry: { location: { lat: number; lng: number } };
  }>;
}

interface GoogleDirectionsResponse {
  status: string;
  error_message?: string;
  routes: Array<{
    overview_polyline?: { points: string };
    legs: Array<{ distance: { value: number }; duration: { value: number }; duration_in_traffic?: { value: number } }>;
  }>;
}

interface GoogleDistanceMatrixResponse {
  status: string;
  error_message?: string;
  rows: Array<{ elements: Array<{ status: string; distance?: { value: number }; duration?: { value: number }; duration_in_traffic?: { value: number } }> }>;
}

export class GoogleMapsProvider implements MapsProvider {
  private readonly baseUrl = 'https://maps.googleapis.com/maps/api';

  constructor(
    private readonly apiKey: string,
    private readonly fetchFn: GoogleFetch = fetch,
  ) {}

  async geocode(address: string): Promise<GeocodedLocation | null> {
    const response = await this.request<GoogleGeocodeResponse>('/geocode/json', { address });
    return response.results[0] ? this.toLocation(response.results[0]) : null;
  }

  async reverseGeocode(coordinate: Coordinate): Promise<GeocodedLocation | null> {
    const response = await this.request<GoogleGeocodeResponse>('/geocode/json', {
      latlng: `${coordinate.latitude},${coordinate.longitude}`,
    });
    return response.results[0] ? this.toLocation(response.results[0]) : null;
  }

  async calculateRoute(origin: Coordinate, destination: Coordinate): Promise<RouteResult> {
    const response = await this.request<GoogleDirectionsResponse>('/directions/json', {
      origin: this.coordinateParam(origin),
      destination: this.coordinateParam(destination),
      mode: 'driving',
    });
    const route = response.routes[0];
    if (!route) throw new MapsProviderError('No route found');
    return {
      distanceMeters: route.legs.reduce((sum, leg) => sum + leg.distance.value, 0),
      durationSeconds: route.legs.reduce((sum, leg) => sum + (leg.duration_in_traffic?.value ?? leg.duration.value), 0),
      polyline: route.overview_polyline?.points,
    };
  }

  async calculateDistance(origin: Coordinate, destination: Coordinate): Promise<DistanceResult> {
    const response = await this.request<GoogleDistanceMatrixResponse>('/distancematrix/json', {
      origins: this.coordinateParam(origin),
      destinations: this.coordinateParam(destination),
      mode: 'driving',
    });
    const element = response.rows[0]?.elements[0];
    if (!element || element.status !== 'OK' || !element.distance || !element.duration) throw new MapsProviderError('No distance result found', element?.status);
    return {
      distanceMeters: element.distance.value,
      durationSeconds: element.duration_in_traffic?.value ?? element.duration.value,
    };
  }

  async calculateEta(origin: Coordinate, destination: Coordinate, departureAt = new Date()): Promise<EtaResult> {
    const response = await this.request<GoogleDistanceMatrixResponse>('/distancematrix/json', {
      origins: this.coordinateParam(origin),
      destinations: this.coordinateParam(destination),
      mode: 'driving',
      departure_time: Math.floor(departureAt.getTime() / 1000).toString(),
    });
    const element = response.rows[0]?.elements[0];
    if (!element || element.status !== 'OK' || !element.duration) throw new MapsProviderError('No ETA result found', element?.status);
    const durationSeconds = element.duration_in_traffic?.value ?? element.duration.value;
    return { durationSeconds, arrivalAt: new Date(departureAt.getTime() + durationSeconds * 1000) };
  }

  private async request<T extends { status: string; error_message?: string }>(path: string, params: Record<string, string>): Promise<T> {
    const query = new URLSearchParams({ ...params, key: this.apiKey });
    const response = await this.fetchFn(`${this.baseUrl}${path}?${query.toString()}`);
    if (!response.ok) throw new MapsProviderError(`Maps provider HTTP error: ${response.status}`);
    const body = await response.json() as T;
    if (body.status !== 'OK' && body.status !== 'ZERO_RESULTS') throw new MapsProviderError(body.error_message ?? `Maps provider returned ${body.status}`, body.status);
    return body;
  }

  private coordinateParam(coordinate: Coordinate) {
    return `${coordinate.latitude},${coordinate.longitude}`;
  }

  private toLocation(result: GoogleGeocodeResponse['results'][number]): GeocodedLocation {
    return {
      formattedAddress: result.formatted_address,
      coordinate: { latitude: result.geometry.location.lat, longitude: result.geometry.location.lng },
      placeId: result.place_id,
    };
  }
}
