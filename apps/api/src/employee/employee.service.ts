import { BadRequestException, ConflictException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { DriverAvailability, DriverDocumentType, DriverStatus, EmployeeStatus, Prisma, RoleCode, UserStatus, VehicleStatus, DocumentStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeEventService } from '../realtime/realtime-event.service';
import type {
  AvailabilityInput,
  DriverDocumentCreateInput,
  DriverDocumentStatusInput,
  DriverReviewInput,
  DriverStatusInput,
  EmployeeCreateInput,
  EmployeeStatusInput,
} from './employee.schemas';

const employeeInclude = {
  user: { select: { id: true, email: true, displayName: true, phoneNumber: true, status: true } },
  driverDocuments: true,
} satisfies Prisma.EmployeeInclude;

type EmployeeWithDetails = Prisma.EmployeeGetPayload<{ include: typeof employeeInclude }>;

@Injectable()
export class EmployeeService {
  constructor(private readonly prisma: PrismaService, @Optional() private readonly events?: RealtimeEventService) {}

  async createEmployee(input: EmployeeCreateInput, actorUserId: string) {
    const email = input.email.toLowerCase();
    const [existingUser, existingEmployee] = await Promise.all([
      this.prisma.user.findUnique({ where: { email } }),
      this.prisma.employee.findUnique({ where: { employeeCode: input.employeeCode } }),
    ]);
    if (existingUser) throw new ConflictException('An account with these credentials already exists');
    if (existingEmployee) throw new ConflictException('Employee code is already in use');

    const passwordHash = await bcrypt.hash(input.password, 12);
    const employee = await this.prisma.$transaction(async (transaction) => {
      const role = await transaction.role.upsert({
        where: { code: RoleCode.EMPLOYEE },
        update: {},
        create: { code: RoleCode.EMPLOYEE },
      });
      return transaction.employee.create({
        data: {
          employeeCode: input.employeeCode,
          user: {
            create: {
              email,
              passwordHash,
              displayName: input.displayName,
              phoneNumber: input.phoneNumber,
              roles: { create: { roleId: role.id } },
            },
          },
        },
        include: employeeInclude,
      });
    });
    await this.audit(actorUserId, 'EMPLOYEE_CREATED', employee.id);
    return this.toEmployee(employee);
  }

  async getOwnEmployee(userId: string) {
    return this.toEmployee(await this.findEmployeeForUser(userId));
  }

  async getEmployee(employeeId: string) {
    return this.toEmployee(await this.findEmployee(employeeId));
  }

  async setEmployeeStatus(employeeId: string, input: EmployeeStatusInput, actorUserId: string) {
    const employee = await this.findEmployee(employeeId);
    const status = input.status as EmployeeStatus;
    const updated = await this.prisma.employee.update({
      where: { id: employee.id },
      data: {
        status,
        ...(status === EmployeeStatus.INACTIVE ? { availability: DriverAvailability.OFFLINE } : {}),
      },
      include: employeeInclude,
    });
    await this.audit(actorUserId, 'EMPLOYEE_STATUS_UPDATED', employeeId, { status });
    return this.toEmployee(updated);
  }

  async setDriverStatus(employeeId: string, input: DriverStatusInput, actorUserId: string) {
    const employee = await this.findEmployee(employeeId);
    if (input.status === DriverStatus.ACTIVE && employee.status !== EmployeeStatus.ACTIVE) {
      throw new BadRequestException('An inactive employee cannot be activated as a driver');
    }
    if (employee.driverStatus === DriverStatus.REJECTED && input.status === DriverStatus.ACTIVE) {
      throw new BadRequestException('A rejected driver must be approved before activation');
    }
    const updated = await this.prisma.employee.update({
      where: { id: employeeId },
      data: {
        driverStatus: input.status as DriverStatus,
        ...(input.status === DriverStatus.INACTIVE ? { availability: DriverAvailability.OFFLINE } : {}),
      },
      include: employeeInclude,
    });
    await this.audit(actorUserId, 'DRIVER_STATUS_UPDATED', employeeId, { status: input.status });
    return this.toEmployee(updated);
  }

  async reviewDriver(employeeId: string, input: DriverReviewInput, actorUserId: string) {
    const employee = await this.findEmployee(employeeId);
    const driverStatus = input.decision === 'APPROVE' ? DriverStatus.ACTIVE : DriverStatus.REJECTED;
    if (input.decision === 'APPROVE' && employee.status !== EmployeeStatus.ACTIVE) {
      throw new BadRequestException('An inactive employee cannot be approved as a driver');
    }
    // Enforce that required documents are VERIFIED before approving
    if (input.decision === 'APPROVE') {
      const required: DriverDocumentType[] = [DriverDocumentType.DRIVING_LICENSE, DriverDocumentType.IDENTITY];
      const missing = required.filter((type) => !employee.driverDocuments.some((d) => d.documentType === type && d.status === DocumentStatus.VERIFIED));
      if (missing.length) {
        throw new BadRequestException('Missing verified documents: ' + missing.join(', '));
      }
    }
    const updated = await this.prisma.employee.update({
      where: { id: employeeId },
      data: {
        driverStatus,
        driverDecisionAt: new Date(),
        driverDecisionNote: input.note,
        driverReviewedById: actorUserId,
        availability: DriverAvailability.OFFLINE,
      },
      include: employeeInclude,
    });
    await this.audit(actorUserId, input.decision === 'APPROVE' ? 'DRIVER_APPROVED' : 'DRIVER_REJECTED', employeeId, { note: input.note });
    // If approved, attempt to assign an available vehicle to the driver.
    let assignedVehicle = null;
    if (driverStatus === DriverStatus.ACTIVE) {
      const vehicle = await this.prisma.vehicle.findFirst({ where: { assignedEmployeeId: null, deletedAt: null, status: VehicleStatus.ACTIVE } });
      if (vehicle) {
        assignedVehicle = await this.prisma.vehicle.update({ where: { id: vehicle.id }, data: { assignedEmployeeId: updated.id } });
        await this.audit(actorUserId, 'VEHICLE_ASSIGNED', assignedVehicle.id, { employeeId: updated.id });
        this.events?.publishVehicleAssigned({ vehicleId: assignedVehicle.id, registrationNumber: assignedVehicle.registrationNumber, employeeId: updated.id });
      }
    }

    // Publish employee update so dashboards refresh in real-time
    this.events?.publishEmployeeUpdated(this.toEmployee(updated));

    return this.toEmployee(updated);
  }

  async updateOwnAvailability(userId: string, input: AvailabilityInput) {
    const employee = await this.findEmployeeForUser(userId);
    if (employee.status !== EmployeeStatus.ACTIVE || employee.driverStatus !== DriverStatus.ACTIVE) {
      throw new BadRequestException('Only an active driver can change availability');
    }
    const updated = await this.prisma.employee.update({
      where: { id: employee.id },
      data: { availability: input.availability as DriverAvailability },
      include: employeeInclude,
    });
    return this.toEmployee(updated);
  }

  async listDocuments(employeeId: string) {
    const employee = await this.findEmployee(employeeId);
    return employee.driverDocuments.map((document) => this.toDocument(document));
  }

  async createDocument(employeeId: string, input: DriverDocumentCreateInput, actorUserId: string) {
    await this.findEmployee(employeeId);
    const document = await this.prisma.driverDocument.create({
      data: {
        employeeId,
        documentType: input.documentType as DriverDocumentType,
        storageKey: input.storageKey,
        expiresAt: input.expiresAt,
        createdById: actorUserId,
      },
    });
    await this.audit(actorUserId, 'DRIVER_DOCUMENT_SUBMITTED', document.id);
    return this.toDocument(document);
  }

  async updateDocumentStatus(documentId: string, input: DriverDocumentStatusInput, actorUserId: string) {
    const document = await this.prisma.driverDocument.findUnique({ where: { id: documentId } });
    if (!document) throw new NotFoundException('Driver document not found');
    const updated = await this.prisma.driverDocument.update({
      where: { id: documentId },
      data: { status: input.status },
    });
    await this.audit(actorUserId, 'DRIVER_DOCUMENT_STATUS_UPDATED', documentId, { status: input.status });
    return this.toDocument(updated);
  }

  private async findEmployee(employeeId: string): Promise<EmployeeWithDetails> {
    const employee = await this.prisma.employee.findUnique({ where: { id: employeeId }, include: employeeInclude });
    if (!employee || employee.deletedAt || employee.user.status !== UserStatus.ACTIVE) {
      throw new NotFoundException('Employee not found');
    }
    return employee;
  }

  private async findEmployeeForUser(userId: string) {
    const employee = await this.prisma.employee.findUnique({ where: { userId }, include: employeeInclude });
    if (!employee || employee.deletedAt || employee.user.status !== UserStatus.ACTIVE) {
      throw new NotFoundException('Employee profile not found');
    }
    return employee;
  }

  private toEmployee(employee: EmployeeWithDetails) {
    return {
      id: employee.id,
      employeeCode: employee.employeeCode,
      status: employee.status,
      driverStatus: employee.driverStatus,
      availability: employee.availability,
      driverDecisionAt: employee.driverDecisionAt,
      driverDecisionNote: employee.driverDecisionNote,
      user: employee.user,
      documents: employee.driverDocuments.map((document) => this.toDocument(document)),
      createdAt: employee.createdAt,
      updatedAt: employee.updatedAt,
    };
  }

  private toDocument(document: EmployeeWithDetails['driverDocuments'][number]) {
    return {
      id: document.id,
      documentType: document.documentType,
      fileName: document.fileName,
      contentType: document.contentType,
      sizeBytes: document.sizeBytes,
      uploadedAt: document.uploadedAt,
      status: document.status,
      expiresAt: document.expiresAt,
      rejectionReason: document.rejectionReason,
      verifiedAt: document.verifiedAt,
      createdAt: document.createdAt,
      updatedAt: document.updatedAt,
    };
  }

  private async audit(actorUserId: string, action: string, entityId: string, metadata?: Prisma.InputJsonValue) {
    await this.prisma.auditLog.create({ data: { actorUserId, action, entityType: 'Employee', entityId, metadata } });
  }
}
