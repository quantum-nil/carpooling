import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, RoleCode, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import type { AdminListQuery, AdminUserCreateInput, AdminUserStatusInput, AdminUserUpdateInput } from './admin.schemas';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async createUser(input: AdminUserCreateInput, actorUserId: string) {
    const email = input.email.toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) throw new ConflictException('An account with this email already exists');
    const passwordHash = await bcrypt.hash(input.password, 12);
    const role = await this.prisma.role.upsert({ where: { code: input.role as RoleCode }, update: {}, create: { code: input.role as RoleCode } });
    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email,
          passwordHash,
          displayName: input.displayName,
          phoneNumber: input.phoneNumber,
          roles: { create: { roleId: role.id } },
          ...(input.role === RoleCode.CUSTOMER ? { customer: { create: {} } } : {}),
        },
        select: { id: true, email: true, displayName: true, phoneNumber: true, status: true, createdAt: true },
      });
      await tx.auditLog.create({ data: { actorUserId, action: 'ADMIN_USER_CREATED', entityType: 'User', entityId: created.id, metadata: { role: input.role } } });
      return created;
    });
    return user;
  }

  async updateUser(userId: string, input: AdminUserUpdateInput, actorUserId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true, deletedAt: true } });
    if (!user || user.deletedAt) throw new NotFoundException('User not found');
    const updated = await this.prisma.user.update({ where: { id: userId }, data: input, select: { id: true, email: true, displayName: true, phoneNumber: true, status: true, updatedAt: true } });
    await this.prisma.auditLog.create({ data: { actorUserId, action: 'ADMIN_USER_UPDATED', entityType: 'User', entityId: userId } });
    return updated;
  }

  async updateUserStatus(userId: string, input: AdminUserStatusInput, actorUserId: string) {
    if (userId === actorUserId) throw new BadRequestException('An administrator cannot change their own status');
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id: userId }, include: { roles: { include: { role: true } } } });
      if (!user || user.deletedAt) throw new NotFoundException('User not found');
      if (user.roles.some(({ role }) => role.code === RoleCode.ADMIN) && input.status !== UserStatus.ACTIVE) {
        const activeAdmins = await tx.user.count({ where: { status: UserStatus.ACTIVE, deletedAt: null, roles: { some: { role: { code: RoleCode.ADMIN } } } } });
        if (activeAdmins <= 1) throw new BadRequestException('The last active administrator cannot be deactivated');
      }
      const updated = await tx.user.update({ where: { id: userId }, data: { status: input.status as UserStatus, deletedAt: input.status === UserStatus.DELETED ? new Date() : null }, select: { id: true, email: true, displayName: true, status: true, deletedAt: true } });
      await tx.auditLog.create({ data: { actorUserId, action: 'ADMIN_USER_STATUS_UPDATED', entityType: 'User', entityId: userId, metadata: { status: input.status } } });
      return updated;
    });
  }

  async overview() {
    const [users, employees, drivers, customers, vehicles, activeRides, payments, pendingDocuments, ratings, auditLogs] = await Promise.all([
      this.prisma.user.count({ where: { deletedAt: null } }),
      this.prisma.employee.count({ where: { deletedAt: null } }),
      this.prisma.employee.count({ where: { deletedAt: null, driverStatus: 'ACTIVE' } }),
      this.prisma.customer.count({ where: { deletedAt: null } }),
      this.prisma.vehicle.count({ where: { deletedAt: null } }),
      this.prisma.ride.count({ where: { status: { in: ['REQUESTED', 'MATCHING', 'OFFERED', 'ACCEPTED', 'DRIVER_ARRIVING', 'IN_PROGRESS'] } } }),
      this.prisma.payment.count(),
      Promise.all([this.prisma.driverDocument.count({ where: { status: 'PENDING' } }), this.prisma.vehicleDocument.count({ where: { status: 'PENDING' } })]).then(([driversPending, vehiclesPending]) => driversPending + vehiclesPending),
      this.prisma.rating.count(),
      this.prisma.auditLog.count(),
    ]);
    return { users, employees, drivers, customers, vehicles, activeRides, payments, pendingDocuments, ratings, auditLogs };
  }

  async users(query: AdminListQuery) {
    const where: Prisma.UserWhereInput = { deletedAt: null, ...(query.status ? { status: query.status as never } : {}), ...(query.search ? { OR: [{ email: { contains: query.search, mode: 'insensitive' } }, { displayName: { contains: query.search, mode: 'insensitive' } }] } : {}) };
    const [items, total] = await this.page(query, this.prisma.user.findMany({ where, select: { id: true, email: true, displayName: true, status: true, createdAt: true, roles: { select: { role: { select: { code: true } } } } }, orderBy: { createdAt: 'desc' } }), this.prisma.user.count({ where }));
    return this.result(items.map((user) => ({ ...user, roles: user.roles.map(({ role }) => role.code) })), total, query);
  }

  async employees(query: AdminListQuery) {
    const where: Prisma.EmployeeWhereInput = { deletedAt: null, ...(query.status ? { status: query.status as never } : {}), ...(query.search ? { OR: [{ employeeCode: { contains: query.search, mode: 'insensitive' } }, { user: { email: { contains: query.search, mode: 'insensitive' } } }] } : {}) };
    const [items, total] = await this.page(query, this.prisma.employee.findMany({ where, select: { id: true, employeeCode: true, status: true, driverStatus: true, availability: true, createdAt: true, user: { select: { id: true, email: true, displayName: true } } }, orderBy: { createdAt: 'desc' } }), this.prisma.employee.count({ where }));
    return this.result(items, total, query);
  }

  async vehicles(query: AdminListQuery) {
    const where: Prisma.VehicleWhereInput = { deletedAt: null, ...(query.status ? { status: query.status as never } : {}), ...(query.search ? { registrationNumber: { contains: query.search, mode: 'insensitive' } } : {}) };
    const [items, total] = await this.page(query, this.prisma.vehicle.findMany({ where, select: { id: true, registrationNumber: true, capacity: true, make: true, model: true, status: true, createdAt: true, assignedEmployee: { select: { employeeCode: true, user: { select: { displayName: true } } } } }, orderBy: { createdAt: 'desc' } }), this.prisma.vehicle.count({ where }));
    return this.result(items, total, query);
  }

  async rides(query: AdminListQuery) {
    const where: Prisma.RideWhereInput = { ...(query.status ? { status: query.status as never } : {}), ...(query.search ? { OR: [{ pickupAddress: { contains: query.search, mode: 'insensitive' } }, { destinationAddress: { contains: query.search, mode: 'insensitive' } }] } : {}) };
    const [items, total] = await this.page(
      query,
      this.prisma.ride.findMany({
        where,
        select: {
          id: true,
          pickupAddress: true,
          destinationAddress: true,
          scheduledAt: true,
          status: true,
          seatCapacity: true,
          estimatedFare: true,
          finalFare: true,
          currency: true,
          createdAt: true,
          requestedByCustomer: { select: { user: { select: { displayName: true, email: true } } } },
          driver: { select: { employeeCode: true, user: { select: { displayName: true } } } },
          vehicle: { select: { registrationNumber: true } },
        },
        orderBy: { scheduledAt: 'desc' },
      }),
      this.prisma.ride.count({ where }),
    );
    return this.result(items.map((ride) => ({ ...ride, estimatedFare: ride.estimatedFare?.toString() ?? null, finalFare: ride.finalFare?.toString() ?? null })), total, query);
  }

  async payments(query: AdminListQuery) {
    const where: Prisma.PaymentWhereInput = { ...(query.status ? { status: query.status as never } : {}), ...(query.search ? { OR: [{ referenceId: { contains: query.search, mode: 'insensitive' } }, { providerOrderId: { contains: query.search, mode: 'insensitive' } }] } : {}) };
    const [items, total] = await this.page(query, this.prisma.payment.findMany({ where, select: { id: true, provider: true, providerOrderId: true, amount: true, currency: true, referenceId: true, status: true, failureCode: true, verifiedAt: true, paidAt: true, createdAt: true, user: { select: { email: true, displayName: true } } }, orderBy: { createdAt: 'desc' } }), this.prisma.payment.count({ where }));
    return this.result(items.map((payment) => ({ ...payment, amount: payment.amount.toString() })), total, query);
  }

  async walletTransactions(query: AdminListQuery) {
    const where: Prisma.WalletTransactionWhereInput = { ...(query.status ? { status: query.status as never } : {}), ...(query.search ? { OR: [{ referenceId: { contains: query.search, mode: 'insensitive' } }, { wallet: { user: { email: { contains: query.search, mode: 'insensitive' } } } }] } : {}) };
    const [items, total] = await this.page(query, this.prisma.walletTransaction.findMany({ where, select: { id: true, type: true, direction: true, status: true, amount: true, currency: true, referenceId: true, balanceAfter: true, createdAt: true, wallet: { select: { user: { select: { email: true, displayName: true } } } } }, orderBy: { createdAt: 'desc' } }), this.prisma.walletTransaction.count({ where }));
    return this.result(items.map((transaction) => ({ ...transaction, amount: transaction.amount.toString(), balanceAfter: transaction.balanceAfter.toString() })), total, query);
  }

  async documents(query: AdminListQuery) {
    const driverWhere = query.status ? { status: query.status as never } : undefined;
    const vehicleWhere = query.status ? { status: query.status as never } : undefined;
    const take = query.page * query.pageSize;
    const [driverDocuments, vehicleDocuments, driverTotal, vehicleTotal] = await Promise.all([
      this.prisma.driverDocument.findMany({ where: driverWhere, select: { id: true, documentType: true, status: true, uploadedAt: true, expiresAt: true, rejectionReason: true, verifiedAt: true, createdAt: true, employee: { select: { employeeCode: true, user: { select: { displayName: true } } } } }, orderBy: { createdAt: 'desc' }, take }),
      this.prisma.vehicleDocument.findMany({ where: vehicleWhere, select: { id: true, documentType: true, status: true, uploadedAt: true, expiresAt: true, rejectionReason: true, verifiedAt: true, createdAt: true, vehicle: { select: { registrationNumber: true } } }, orderBy: { createdAt: 'desc' }, take }),
      this.prisma.driverDocument.count({ where: driverWhere }),
      this.prisma.vehicleDocument.count({ where: vehicleWhere }),
    ]);
    const offset = (query.page - 1) * query.pageSize;
    const items = [
      ...driverDocuments.map((document) => ({ ...document, resource: 'DRIVER' as const })),
      ...vehicleDocuments.map((document) => ({ ...document, resource: 'VEHICLE' as const })),
    ].sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime()).slice(offset, offset + query.pageSize);
    return {
      items,
      pagination: { page: query.page, pageSize: query.pageSize, total: driverTotal + vehicleTotal, totalPages: Math.max(1, Math.ceil((driverTotal + vehicleTotal) / query.pageSize)) },
    };
  }

  async ratings(query: AdminListQuery) {
    const where: Prisma.RatingWhereInput = { ...(query.search ? { reviewText: { contains: query.search, mode: 'insensitive' } } : {}), ...(query.status ? { status: query.status as never } : {}) };
    const [items, total] = await this.page(query, this.prisma.rating.findMany({ where, select: { id: true, rideId: true, direction: true, score: true, reviewText: true, status: true, createdAt: true, rater: { select: { displayName: true, email: true } }, rated: { select: { displayName: true, email: true } }, reports: { where: { status: 'OPEN' }, select: { id: true, reason: true, status: true, createdAt: true } } }, orderBy: { createdAt: 'desc' } }), this.prisma.rating.count({ where }));
    return this.result(items, total, query);
  }

  async auditLogs(query: AdminListQuery) {
    const where: Prisma.AuditLogWhereInput = {
      ...(query.search ? { OR: [{ action: { contains: query.search, mode: 'insensitive' } }, { entityType: { contains: query.search, mode: 'insensitive' } }] } : {}),
      ...(query.actorUserId ? { actorUserId: query.actorUserId } : {}),
      ...(query.from || query.to ? { createdAt: { ...(query.from ? { gte: query.from } : {}), ...(query.to ? { lte: query.to } : {}) } } : {}),
    };
    const [items, total] = await this.page(query, this.prisma.auditLog.findMany({ where, select: { id: true, entityType: true, entityId: true, action: true, metadata: true, createdAt: true, actor: { select: { email: true, displayName: true } } }, orderBy: { createdAt: 'desc' } }), this.prisma.auditLog.count({ where }));
    return this.result(items, total, query);
  }

  private async page<T>(query: AdminListQuery, findMany: Prisma.PrismaPromise<T[]>, count: Prisma.PrismaPromise<number>) {
    return Promise.all([findMany, count]);
  }

  private result<T>(items: T[], total: number, query: AdminListQuery) {
    return { items, pagination: { page: query.page, pageSize: query.pageSize, total, totalPages: Math.ceil(total / query.pageSize) } };
  }
}
