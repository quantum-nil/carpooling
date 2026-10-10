import { customerProfileUpdateSchema, savedLocationCreateSchema } from '../src/customer/customer.schemas';

describe('customer validation', () => {
  it('validates coordinates and rejects unknown fields', () => {
    expect(() => savedLocationCreateSchema.parse({ label: 'Home', address: 'Street', latitude: 91, longitude: 0 })).toThrow();
    expect(() => savedLocationCreateSchema.parse({ label: 'Home', address: 'Street', latitude: 12, longitude: 77, passwordHash: 'secret' })).toThrow();
  });

  it('accepts preferred settings but rejects role/status mutation fields', () => {
    expect(customerProfileUpdateSchema.parse({ preferredSettings: { language: 'en', notifications: true } })).toEqual({
      preferredSettings: { language: 'en', notifications: true },
    });
    expect(() => customerProfileUpdateSchema.parse({ status: 'INACTIVE' })).toThrow();
    expect(() => customerProfileUpdateSchema.parse({ roles: ['ADMIN'] })).toThrow();
  });
});
