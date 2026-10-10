import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

async function main() {
  const prisma = new PrismaClient();
  const email = 'admin@local.test';
  const password = 'AdminLocal1234';
  const passwordHash = await bcrypt.hash(password, 12);

  const role = await prisma.role.upsert({
    where: { code: 'ADMIN' },
    update: {},
    create: { code: 'ADMIN' },
  });

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    await prisma.user.update({
      where: { email },
      data: {
        passwordHash,
        status: 'ACTIVE',
        deletedAt: null,
        roles: {
          connectOrCreate: {
            where: { userId_roleId: { userId: existing.id, roleId: role.id } },
            create: { roleId: role.id },
          },
        },
      },
    });
    console.log('Updated existing admin:', email);
  } else {
    await prisma.user.create({
      data: {
        email,
        passwordHash,
        status: 'ACTIVE',
        roles: { create: { roleId: role.id } },
      },
    });
    console.log('Created new admin:', email);
  }

  console.log('PASSWORD:', password);
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});