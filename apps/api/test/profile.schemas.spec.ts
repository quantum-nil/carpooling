import { profileUpdateSchema } from '../src/profile/profile.schemas';

describe('profile validation', () => {
  it('rejects role and sensitive fields', () => {
    expect(() => profileUpdateSchema.parse({ displayName: 'Person', roles: ['ADMIN'] })).toThrow();
    expect(() => profileUpdateSchema.parse({ passwordHash: 'plaintext' })).toThrow();
  });

  it('rejects invalid phone numbers and empty updates', () => {
    expect(() => profileUpdateSchema.parse({ phoneNumber: 'not-a-phone' })).toThrow();
    expect(() => profileUpdateSchema.parse({})).toThrow();
  });
});
