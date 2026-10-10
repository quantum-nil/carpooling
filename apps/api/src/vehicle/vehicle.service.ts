import { ConflictException, ForbiddenException, Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { DriverStatus, EmployeeStatus, Prisma, RoleCode, UserStatus, VehicleStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type {
  VehicleAssignmentInput,
  VehicleCreateInput,
  VehicleStatusInput,
  VehicleUpdateInput,
} from './vehicle.schemas';

const vehicleInclude = {
  assignedEmployee: { select: { id: true, userId: true, employeeCode: true } },
} satisfies Prisma.VehicleInclude;

type VehicleWithAssignment = Prisma.VehicleGetPayload<{ include: typeof vehicleInclude }>;

@Injectable()
export class VehicleService {
  constructor(private readonly prisma: PrismaService) {}

  async createVehicle(input: VehicleCreateInput, actorUserId: string) {
    const registrationNumber = this.normalizeRegistration(input.registrationNumber);
    const existing = await this.prisma.vehicle.findUnique({ where: { registrationNumber } });
    if (existing) throw new ConflictException('Registration number is already in use');

    const vehicle = await this.prisma.vehicle.create({
      data: { ...input, metadata: input.metadata === null ? Prisma.JsonNull : input.metadata, registrationNumber },
      include: vehicleInclude,
    });
    await this.audit(actorUserId, 'VEHICLE_CREATED', vehicle.id);
    return this.toVehicle(vehicle as VehicleWithAssignment);
  }

  async listAssignedVehicles(userId: string) {
    const employee = await this.prisma.employee.findUnique({ where: { userId } });
    if (!employee || employee.deletedAt || employee.status !== EmployeeStatus.ACTIVE) {
      throw new NotFoundException('Employee profile not found');
    }
    const vehicles = await this.prisma.vehicle.findMany({
      where: { assignedEmployeeId: employee.id, deletedAt: null },
      include: vehicleInclude,
      orderBy: { createdAt: 'desc' },
    });
    return vehicles.map((vehicle) => this.toVehicle(vehicle));
  }

  async getVehicle(vehicleId: string, actorUserId: string) {
    const vehicle = await this.assertCanManage(vehicleId, actorUserId);
    return this.toVehicle(vehicle);
  }

  async updateVehicle(vehicleId: string, input: VehicleUpdateInput, actorUserId: string) {
    await this.assertCanManage(vehicleId, actorUserId);
    const data = {
      ...input,
      ...(input.registrationNumber !== undefined
        ? { registrationNumber: this.normalizeRegistration(input.registrationNumber) }
        : {}),
      ...(input.metadata === null ? { metadata: Prisma.JsonNull } : {}),
    };
    if (data.registrationNumber) {
      const existing = await this.prisma.vehicle.findUnique({ where: { registrationNumber: data.registrationNumber } });
      if (existing && existing.id !== vehicleId) throw new ConflictException('Registration number is already in use');
    }
    const vehicle = await this.prisma.vehicle.update({ where: { id: vehicleId }, data: data as Prisma.VehicleUpdateInput, include: vehicleInclude });
    await this.audit(actorUserId, 'VEHICLE_UPDATED', vehicleId);
    return this.toVehicle(vehicle as VehicleWithAssignment);
  }

  async updateStatus(vehicleId: string, input: VehicleStatusInput, actorUserId: string) {
    await this.assertCanManage(vehicleId, actorUserId);
    const vehicle = await this.prisma.vehicle.update({
      where: { id: vehicleId },
      data: { status: input.status as VehicleStatus, ...(input.status === VehicleStatus.RETIRED ? { assignedEmployeeId: null } : {}) },
      include: vehicleInclude,
    });
    await this.audit(actorUserId, 'VEHICLE_STATUS_UPDATED', vehicleId, { status: input.status });
    return this.toVehicle(vehicle);
  }

  async removeVehicle(vehicleId: string, actorUserId: string) {
    await this.assertCanManage(vehicleId, actorUserId);
    const vehicle = await this.prisma.vehicle.update({
      where: { id: vehicleId },
      data: { status: VehicleStatus.RETIRED, deletedAt: new Date(), assignedEmployeeId: null },
      include: vehicleInclude,
    });
    await this.audit(actorUserId, 'VEHICLE_REMOVED', vehicleId);
    return this.toVehicle(vehicle);
  }

  async assignVehicle(vehicleId: string, input: VehicleAssignmentInput, actorUserId: string) {
    const currentVehicle = await this.findVehicle(vehicleId);
    if (currentVehicle.status === VehicleStatus.RETIRED) {
      throw new BadRequestException('A retired vehicle cannot be assigned');
    }
    if (input.employeeId) {
      const employee = await this.prisma.employee.findUnique({ where: { id: input.employeeId } });
      if (!employee || employee.deletedAt || employee.status !== EmployeeStatus.ACTIVE || employee.driverStatus !== DriverStatus.ACTIVE) {
        throw new BadRequestException('Vehicle can only be assigned to an active driver');
      }
    }
    const vehicle = await this.prisma.vehicle.update({
      where: { id: vehicleId },
      data: { assignedEmployeeId: input.employeeId },
      include: vehicleInclude,
    });
    await this.audit(actorUserId, 'VEHICLE_ASSIGNED', vehicleId, { employeeId: input.employeeId });
    return this.toVehicle(vehicle);
  }

  private async assertCanManage(vehicleId: string, actorUserId: string): Promise<VehicleWithAssignment> {
    const vehicle = await this.findVehicle(vehicleId);
    const actor = await this.prisma.user.findUnique({
      where: { id: actorUserId },
      select: { status: true, deletedAt: true, roles: { select: { role: { select: { code: true } } } } },
    });
    if (!actor || actor.status !== UserStatus.ACTIVE || actor.deletedAt) throw new ForbiddenException('Access denied');
    const roles = actor.roles.map(({ role }) => role.code);
    if (roles.includes(RoleCode.ADMIN)) return vehicle;
    if (roles.includes(RoleCode.EMPLOYEE) && vehicle.assignedEmployee?.userId === actorUserId) return vehicle;
    throw new ForbiddenException('You are not permitted to manage this vehicle');
  }

  private async findVehicle(vehicleId: string): Promise<VehicleWithAssignment> {
    const vehicle = await this.prisma.vehicle.findUnique({ where: { id: vehicleId }, include: vehicleInclude });
    if (!vehicle || vehicle.deletedAt) throw new NotFoundException('Vehicle not found');
    return vehicle;
  }

  private normalizeRegistration(value: string) {
    return value.trim().toUpperCase();
  }

  private toVehicle(vehicle: VehicleWithAssignment) {
    return {
      id: vehicle.id,
      registrationNumber: vehicle.registrationNumber,
      capacity: vehicle.capacity,
      make: vehicle.make,
      model: vehicle.model,
      metadata: vehicle.metadata,
      status: vehicle.status,
      assignedEmployee: vehicle.assignedEmployee,
      createdAt: vehicle.createdAt,
      updatedAt: vehicle.updatedAt,
    };
  }

  private async audit(actorUserId: string, action: string, entityId: string, metadata?: Prisma.InputJsonValue) {
    await this.prisma.auditLog.create({ data: { actorUserId, action, entityType: 'Vehicle', entityId, metadata } });
  }
}
