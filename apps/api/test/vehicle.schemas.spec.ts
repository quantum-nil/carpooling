import { vehicleCreateSchema } from '../src/vehicle/vehicle.schemas';

describe('vehicle validation', () => {
  it('requires a positive bounded capacity', () => {
    expect(() => vehicleCreateSchema.parse({ registrationNumber: 'AB1', capacity: 0 })).toThrow();
    expect(() => vehicleCreateSchema.parse({ registrationNumber: 'AB1', capacity: 101 })).toThrow();
    expect(vehicleCreateSchema.parse({ registrationNumber: 'AB1', capacity: 4 })).toMatchObject({ capacity: 4 });
  });

  it('rejects unknown assignment and sensitive fields from vehicle CRUD input', () => {
    expect(() => vehicleCreateSchema.parse({ registrationNumber: 'AB1', capacity: 4, assignedEmployeeId: 'employee-id' })).toThrow();
    expect(() => vehicleCreateSchema.parse({ registrationNumber: 'AB1', capacity: 4, passwordHash: 'secret' })).toThrow();
  });
});
