import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient, RoleCode, VehicleDocumentType, DocumentStatus } from '@prisma/client';

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

  try {
    // find admin user to mark documents as verifiedBy
    let admin = await prisma.user.findUnique({ where: { email: 'admin@local.test' } });
    if (!admin) {
      const adminRole = await prisma.role.findFirst({ where: { code: RoleCode.ADMIN } });
      if (adminRole) {
        const withRole = await prisma.user.findFirst({ where: { roles: { some: { roleId: adminRole.id } } } });
        admin = withRole ?? null;
      }
    }

    const adminId = admin?.id ?? null;
    if (!adminId) console.warn('No admin user found; documents will not have verifiedById/createdById');

    for (let i = 1; i <= 10; i++) {
      const email = `employee${i}@local.test`;
      const user = await prisma.user.findUnique({ where: { email }, include: { employee: true } });
      if (!user || !user.employee) {
        console.warn(`Skipping ${email} - no employee profile found`);
        continue;
      }
      const employee = user.employee;

      // activate driver status so assignment is allowed
      await prisma.employee.update({ where: { id: employee.id }, data: { driverStatus: 'ACTIVE', status: 'ACTIVE' } });

      const registrationNumber = `CAR-${String(i).padStart(3, '0')}`;
      const make = ['Toyota', 'Hyundai', 'Maruti', 'Honda', 'Ford', 'Mahindra', 'Kia', 'Renault', 'Tata', 'Volkswagen'][(i - 1) % 10];
      const model = `Model-${String(i).padStart(2, '0')}`;
      const capacity = 4;

      // upsert vehicle by registrationNumber (create or update)
      const vehicle = await prisma.vehicle.upsert({
        where: { registrationNumber },
        update: { capacity, make, model, status: 'ACTIVE', assignedEmployeeId: employee.id },
        create: { registrationNumber, capacity, make, model, status: 'ACTIVE', assignedEmployeeId: employee.id },
      });

      // create a verified registration document
      const storageKey = `vehicles/${vehicle.id}/registration.pdf`;
      // upsert registration document for vehicle
      const existingDoc = await prisma.vehicleDocument.findFirst({ where: { vehicleId: vehicle.id, documentType: VehicleDocumentType.REGISTRATION } });
      if (existingDoc) {
        await prisma.vehicleDocument.update({ where: { id: existingDoc.id }, data: { storageKey, status: DocumentStatus.VERIFIED, fileName: 'registration.pdf', contentType: 'application/pdf', sizeBytes: 12345, uploadedAt: new Date(), expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), verifiedAt: new Date(), createdById: adminId, verifiedById: adminId } });
      } else {
        await prisma.vehicleDocument.create({ data: { vehicleId: vehicle.id, documentType: VehicleDocumentType.REGISTRATION, storageKey, status: DocumentStatus.VERIFIED, fileName: 'registration.pdf', contentType: 'application/pdf', sizeBytes: 12345, uploadedAt: new Date(), expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), verifiedAt: new Date(), createdById: adminId, verifiedById: adminId } });
      }

      console.log(`Created vehicle ${registrationNumber} for ${email} (vehicle id ${vehicle.id})`);
    }

    console.log('Seeding vehicles complete');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
