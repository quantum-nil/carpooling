import { driverLocationSchema } from '../src/driver-location/driver-location.schemas';

describe('driver location validation', () => {
  it('accepts valid coordinates', () => {
    expect(driverLocationSchema.parse({ latitude: 12.9716, longitude: 77.5946 })).toEqual({ latitude: 12.9716, longitude: 77.5946 });
  });

  it('rejects invalid coordinates and unknown fields', () => {
    expect(() => driverLocationSchema.parse({ latitude: 91, longitude: 77 })).toThrow();
    expect(() => driverLocationSchema.parse({ latitude: 12, longitude: 181 })).toThrow();
    expect(() => driverLocationSchema.parse({ latitude: 12, longitude: 77, recordedAt: 'client-time' })).toThrow();
  });
});
