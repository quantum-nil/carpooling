import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import bcrypt from 'bcryptjs';
import { PrismaClient, RoleCode } from '@prisma/client';

type CustomerSeed = {
  email: string;
  password: string;
  displayName: string;
  phoneNumber: string;
};

const customers: CustomerSeed[] = [
  { email: 'customer1@local.test', password: 'CustomerPass1!', displayName: 'Customer One', phoneNumber: '9100000001' },
  { email: 'customer2@local.test', password: 'CustomerPass2!', displayName: 'Customer Two', phoneNumber: '9100000002' },
  { email: 'customer3@local.test', password: 'CustomerPass3!', displayName: 'Customer Three', phoneNumber: '9100000003' },
  { email: 'customer4@local.test', password: 'CustomerPass4!', displayName: 'Customer Four', phoneNumber: '9100000004' },
  { email: 'customer5@local.test', password: 'CustomerPass5!', displayName: 'Customer Five', phoneNumber: '9100000005' },
  { email: 'customer6@local.test', password: 'CustomerPass6!', displayName: 'Customer Six', phoneNumber: '9100000006' },
  { email: 'customer7@local.test', password: 'CustomerPass7!', displayName: 'Customer Seven', phoneNumber: '9100000007' },
  { email: 'customer8@local.test', password: 'CustomerPass8!', displayName: 'Customer Eight', phoneNumber: '9100000008' },
  { email: 'customer9@local.test', password: 'CustomerPass9!', displayName: 'Customer Nine', phoneNumber: '9100000009' },
  { email: 'customer10@local.test', password: 'CustomerPass10!', displayName: 'Customer Ten', phoneNumber: '9100000010' },
];

function loadEnvIfMissing() {
  if (process.env.DATABASE_URL) return;
  const projectRoot = join(__dirname, '..', '..');
  const envFiles = [join(projectRoot, '.env'), join(projectRoot, '.env.example')];

  for (const envFile of envFiles) {
    if (!existsSync(envFile)) continue;
    const contents = readFileSync(envFile, 'utf8');
    for (const line of contents.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const splitIndex = trimmed.indexOf('=');
      if (splitIndex === -1) continue;
      const key = trimmed.slice(0, splitIndex).trim();
      const value = trimmed.slice(splitIndex + 1).trim();
      if (key === 'DATABASE_URL') {
        process.env.DATABASE_URL = value;
        return;
      }
    }
  }
}

async function main() {
  loadEnvIfMissing();
  const prisma = new PrismaClient();

  const role = await prisma.role.upsert({
    where: { code: RoleCode.CUSTOMER },
    update: {},
    create: { code: RoleCode.CUSTOMER },
  });

  for (const customer of customers) {
    const passwordHash = await bcrypt.hash(customer.password, 12);
    const existing = await prisma.user.findUnique({ where: { email: customer.email }, include: { customer: true } });

    if (existing) {
      await prisma.user.update({
        where: { email: customer.email },
        data: {
          passwordHash,
          displayName: customer.displayName,
          phoneNumber: customer.phoneNumber,
          status: 'ACTIVE',
          deletedAt: null,
          roles: {
            connectOrCreate: {
              where: { userId_roleId: { userId: existing.id, roleId: role.id } },
              create: { roleId: role.id },
            },
          },
          customer: {
            upsert: {
              create: {},
              update: {},
            },
          },
        },
      });
      console.log('Updated customer user:', customer.email);
      continue;
    }

    await prisma.user.create({
      data: {
        email: customer.email,
        passwordHash,
        displayName: customer.displayName,
        phoneNumber: customer.phoneNumber,
        status: 'ACTIVE',
        roles: { create: { roleId: role.id } },
        customer: { create: {} },
      },
    });
    console.log('Created customer user:', customer.email);
  }

  await prisma.$disconnect();
  console.log('Seeded 10 customer accounts.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});