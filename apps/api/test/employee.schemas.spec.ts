import { driverReviewSchema, employeeCreateSchema } from '../src/employee/employee.schemas';

describe('employee validation', () => {
  it('requires a rejection reason', () => {
    expect(() => driverReviewSchema.parse({ decision: 'REJECT' })).toThrow();
    expect(driverReviewSchema.parse({ decision: 'REJECT', note: 'Documents rejected' })).toEqual({
      decision: 'REJECT',
      note: 'Documents rejected',
    });
  });

  it('validates employee creation credentials and rejects unknown fields', () => {
    expect(() => employeeCreateSchema.parse({
      email: 'driver@example.com',
      password: 'a-secure-password',
      employeeCode: 'EMP-001',
      role: 'ADMIN',
    })).toThrow();
  });
});
