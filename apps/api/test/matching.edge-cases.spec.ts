import { haversineMeters } from '../src/matching/matching.service';

describe('matching geographic filtering', () => {
  it('returns zero distance for identical coordinates and a positive distance otherwise', () => {
    expect(haversineMeters(12, 77, 12, 77)).toBe(0);
    expect(haversineMeters(12, 77, 13, 78)).toBeGreaterThan(0);
  });
});
