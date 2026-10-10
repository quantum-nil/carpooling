import { AdminService } from './admin.service';

describe('AdminService', () => {
  it('returns overview counts from read-only queries', async () => {
    const count = jest.fn().mockResolvedValue(2);
    const prisma = {
      user: { count }, employee: { count }, customer: { count }, vehicle: { count }, ride: { count }, payment: { count }, rating: { count }, auditLog: { count },
      driverDocument: { count: jest.fn().mockResolvedValue(1) }, vehicleDocument: { count: jest.fn().mockResolvedValue(3) },
    };
    const service = new AdminService(prisma as never);
    const result = await service.overview();
    expect(result).toMatchObject({ users: 2, employees: 2, drivers: 2, customers: 2, vehicles: 2, activeRides: 2, payments: 2, pendingDocuments: 4, ratings: 2, auditLogs: 2 });
  });

  it('returns paginated users without password fields', async () => {
    const prisma = {
      user: {
        findMany: jest.fn().mockResolvedValue([{ id: 'user-1', email: 'admin@example.com', displayName: 'Admin', status: 'ACTIVE', createdAt: new Date(), roles: [{ role: { code: 'ADMIN' } }] }]),
        count: jest.fn().mockResolvedValue(1),
      },
    };
    const service = new AdminService(prisma as never);
    const result = await service.users({ page: 1, pageSize: 20 });
    expect(result.pagination).toEqual({ page: 1, pageSize: 20, total: 1, totalPages: 1 });
    expect(result.items[0]).not.toHaveProperty('passwordHash');
    expect(result.items[0].roles).toEqual(['ADMIN']);
  });
});
