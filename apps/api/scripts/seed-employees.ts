import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import bcrypt from 'bcryptjs';
import { PrismaClient, RoleCode } from '@prisma/client';

type EmployeeSeed = {
  email: string;
  password: string;
  displayName: string;
  phoneNumber: string;
  employeeCode: string;
};

const employees: EmployeeSeed[] = [
  { email: 'employee1@local.test', password: 'EmployeePass1!', displayName: 'Employee One', phoneNumber: '9000000001', employeeCode: 'EMP001' },
  { email: 'employee2@local.test', password: 'EmployeePass2!', displayName: 'Employee Two', phoneNumber: '9000000002', employeeCode: 'EMP002' },
  { email: 'employee3@local.test', password: 'EmployeePass3!', displayName: 'Employee Three', phoneNumber: '9000000003', employeeCode: 'EMP003' },
  { email: 'employee4@local.test', password: 'EmployeePass4!', displayName: 'Employee Four', phoneNumber: '9000000004', employeeCode: 'EMP004' },
  { email: 'employee5@local.test', password: 'EmployeePass5!', displayName: 'Employee Five', phoneNumber: '9000000005', employeeCode: 'EMP005' },
  { email: 'employee6@local.test', password: 'EmployeePass6!', displayName: 'Employee Six', phoneNumber: '9000000006', employeeCode: 'EMP006' },
  { email: 'employee7@local.test', password: 'EmployeePass7!', displayName: 'Employee Seven', phoneNumber: '9000000007', employeeCode: 'EMP007' },
  { email: 'employee8@local.test', password: 'EmployeePass8!', displayName: 'Employee Eight', phoneNumber: '9000000008', employeeCode: 'EMP008' },
  { email: 'employee9@local.test', password: 'EmployeePass9!', displayName: 'Employee Nine', phoneNumber: '9000000009', employeeCode: 'EMP009' },
  { email: 'employee10@local.test', password: 'EmployeePass10!', displayName: 'Employee Ten', phoneNumber: '9000000010', employeeCode: 'EMP010' },
];

function loadEnvFileIfNeeded() {
  if (process.env.DATABASE_URL) return;

  const projectRoot = join(__dirname, '..', '..');
  const envPaths = [join(projectRoot, '.env'), join(projectRoot, '.env.example')];

  for (const envPath of envPaths) {
    if (!existsSync(envPath)) continue;

    const file = readFileSync(envPath, 'utf8');
    for (const line of file.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const index = trimmed.indexOf('=');
      if (index === -1) continue;
      const key = trimmed.slice(0, index).trim();
      const value = trimmed.slice(index + 1).trim();
      if (key === 'DATABASE_URL') {
        process.env.DATABASE_URL = value;
        return;
      }
    }
  }
}

async function main() {
  loadEnvFileIfNeeded();

  const prisma = new PrismaClient();
  const role = await prisma.role.upsert({
    where: { code: RoleCode.EMPLOYEE },
    update: {},
    create: { code: RoleCode.EMPLOYEE },
  });

  for (const employee of employees) {
    const passwordHash = await bcrypt.hash(employee.password, 12);
    const existingUser = await prisma.user.findUnique({
      where: { email: employee.email },
      include: { employee: true },
    });

    if (existingUser) {
      await prisma.user.update({
        where: { email: employee.email },
        data: {
          passwordHash,
          displayName: employee.displayName,
          phoneNumber: employee.phoneNumber,
          status: 'ACTIVE',
          deletedAt: null,
          roles: {
            connectOrCreate: {
              where: { userId_roleId: { userId: existingUser.id, roleId: role.id } },
              create: { roleId: role.id },
            },
          },
          employee: {
            upsert: {
              create: {
                employeeCode: employee.employeeCode,
                status: 'ACTIVE',
                driverStatus: 'PENDING_APPROVAL',
                availability: 'OFFLINE',
              },
              update: {
                employeeCode: employee.employeeCode,
                status: 'ACTIVE',
              },
            },
          },
        },
      });
      console.log('Updated employee user:', employee.email);
      continue;
    }

    await prisma.user.create({
      data: {
        email: employee.email,
        passwordHash,
        displayName: employee.displayName,
        phoneNumber: employee.phoneNumber,
        status: 'ACTIVE',
        roles: { create: { roleId: role.id } },
        employee: {
          create: {
            employeeCode: employee.employeeCode,
            status: 'ACTIVE',
            driverStatus: 'PENDING_APPROVAL',
            availability: 'OFFLINE',
          },
        },
      },
    });
    console.log('Created employee user:', employee.email);
  }

  await prisma.$disconnect();
  console.log('Seeded 10 employee accounts.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
