import { MapsService } from '../src/maps/maps.service';
import type { MapsProvider } from '../src/maps/maps.provider';

describe('MapsService', () => {
  const provider: jest.Mocked<MapsProvider> = {
    geocode: jest.fn(),
    reverseGeocode: jest.fn(),
    calculateRoute: jest.fn(),
    calculateDistance: jest.fn(),
    calculateEta: jest.fn(),
  };
  const service = new MapsService(provider);
  const origin = { latitude: 12, longitude: 77 };
  const destination = { latitude: 13, longitude: 78 };

  beforeEach(() => jest.clearAllMocks());

  it('delegates geocoding and reverse geocoding to the provider', async () => {
    provider.geocode.mockResolvedValue({ formattedAddress: 'Home', coordinate: origin, placeId: 'place-1' });
    provider.reverseGeocode.mockResolvedValue({ formattedAddress: 'Office', coordinate: destination });

    await expect(service.geocode('Home')).resolves.toMatchObject({ formattedAddress: 'Home' });
    await expect(service.reverseGeocode(origin)).resolves.toMatchObject({ formattedAddress: 'Office' });
    expect(provider.geocode).toHaveBeenCalledWith('Home');
    expect(provider.reverseGeocode).toHaveBeenCalledWith(origin);
  });

  it('delegates route, distance, and ETA calculations', async () => {
    provider.calculateRoute.mockResolvedValue({ distanceMeters: 1000, durationSeconds: 120 });
    provider.calculateDistance.mockResolvedValue({ distanceMeters: 1000, durationSeconds: 120 });
    provider.calculateEta.mockResolvedValue({ durationSeconds: 120, arrivalAt: new Date('2026-01-01') });

    await service.calculateRoute(origin, destination);
    await service.calculateDistance(origin, destination);
    await service.calculateEta(origin, destination);

    expect(provider.calculateRoute).toHaveBeenCalledWith(origin, destination);
    expect(provider.calculateDistance).toHaveBeenCalledWith(origin, destination);
    expect(provider.calculateEta).toHaveBeenCalledWith(origin, destination, undefined);
  });
});
