import { PrismaClient, RoleCode } from '@prisma/client';

const databaseTests = process.env.RUN_DATABASE_TESTS === 'true' ? describe : describe.skip;

databaseTests('database foundation', () => {
  const prisma = new PrismaClient();
  let userId: string;

  beforeAll(async () => {
    await prisma.$connect();
  });

  it('persists a user-role relationship', async () => {
    const role = await prisma.role.upsert({
      where: { code: RoleCode.CUSTOMER },
      update: {},
      create: { code: RoleCode.CUSTOMER },
    });
    const user = await prisma.user.create({
      data: {
        email: `database-test-${Date.now()}@example.test`,
        passwordHash: 'test-only-hash',
        roles: { create: { roleId: role.id } },
      },
      include: { roles: true },
    });
    userId = user.id;

    expect(user.roles).toHaveLength(1);
    expect(user.roles[0].roleId).toBe(role.id);
  });

  afterAll(async () => {
    if (userId) {
      await prisma.user.delete({ where: { id: userId } });
    }
    await prisma.$disconnect();
  });
});
