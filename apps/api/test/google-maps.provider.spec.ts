import { GoogleMapsProvider } from '../src/maps/google-maps.provider';
import { MapsProviderError } from '../src/maps/maps.provider';

describe('GoogleMapsProvider', () => {
  const fetchMock = jest.fn();
  const provider = new GoogleMapsProvider('server-only-test-key', fetchMock as unknown as typeof fetch);

  beforeEach(() => jest.clearAllMocks());

  function response(body: unknown, ok = true, status = 200) {
    fetchMock.mockResolvedValue({ ok, status, json: async () => body });
  }

  it('normalizes geocoding and reverse-geocoding responses', async () => {
    response({
      status: 'OK',
      results: [{ formatted_address: 'Home', place_id: 'place-1', geometry: { location: { lat: 12, lng: 77 } } }],
    });
    await expect(provider.geocode('Home')).resolves.toEqual({
      formattedAddress: 'Home', coordinate: { latitude: 12, longitude: 77 }, placeId: 'place-1',
    });
    await provider.reverseGeocode({ latitude: 12, longitude: 77 });
    expect(fetchMock.mock.calls[1][0]).toContain('latlng=12%2C77');
    expect(fetchMock.mock.calls[1][0]).toContain('key=server-only-test-key');
  });

  it('normalizes route, distance, and ETA responses', async () => {
    response({ status: 'OK', routes: [{ overview_polyline: { points: 'abc' }, legs: [{ distance: { value: 1200 }, duration: { value: 100 } }] }] });
    await expect(provider.calculateRoute({ latitude: 1, longitude: 2 }, { latitude: 3, longitude: 4 })).resolves.toEqual({
      distanceMeters: 1200, durationSeconds: 100, polyline: 'abc',
    });

    response({ status: 'OK', rows: [{ elements: [{ status: 'OK', distance: { value: 1200 }, duration: { value: 100 } }] }] });
    await expect(provider.calculateDistance({ latitude: 1, longitude: 2 }, { latitude: 3, longitude: 4 })).resolves.toEqual({ distanceMeters: 1200, durationSeconds: 100 });

    const departure = new Date('2026-01-01T00:00:00.000Z');
    response({ status: 'OK', rows: [{ elements: [{ status: 'OK', duration: { value: 100 }, duration_in_traffic: { value: 120 } }] }] });
    await expect(provider.calculateEta({ latitude: 1, longitude: 2 }, { latitude: 3, longitude: 4 }, departure)).resolves.toEqual({
      durationSeconds: 120, arrivalAt: new Date(departure.getTime() + 120_000),
    });
  });

  it('converts provider and HTTP failures into MapsProviderError', async () => {
    response({ status: 'REQUEST_DENIED', error_message: 'Invalid key', results: [] });
    await expect(provider.geocode('Home')).rejects.toBeInstanceOf(MapsProviderError);
    response({}, false, 500);
    await expect(provider.geocode('Home')).rejects.toBeInstanceOf(MapsProviderError);
  });
});
