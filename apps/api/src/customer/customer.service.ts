import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { CustomerStatus, Prisma, UserStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type {
  CustomerProfileUpdateInput,
  CustomerStatusInput,
  SavedLocationCreateInput,
  SavedLocationUpdateInput,
} from './customer.schemas';

const customerInclude = {
  user: { select: { id: true, email: true, displayName: true, phoneNumber: true, status: true } },
  savedLocations: { where: { deletedAt: null }, orderBy: { createdAt: 'desc' as const } },
} satisfies Prisma.CustomerInclude;

type CustomerWithDetails = Prisma.CustomerGetPayload<{ include: typeof customerInclude }>;

@Injectable()
export class CustomerService {
  constructor(private readonly prisma: PrismaService) {}

  async getOwnProfile(userId: string) {
    return this.toProfile(await this.findCustomerForUser(userId, true));
  }

  async updateOwnProfile(userId: string, input: CustomerProfileUpdateInput) {
    const customer = await this.findCustomerForUser(userId, true);
    const { displayName, phoneNumber, preferredSettings } = input;
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: userId }, data: { displayName, phoneNumber } }),
      this.prisma.customer.update({ where: { id: customer.id }, data: { preferredSettings: preferredSettings === null ? Prisma.JsonNull : preferredSettings } }),
      this.prisma.auditLog.create({
        data: { actorUserId: userId, entityType: 'Customer', entityId: customer.id, action: 'CUSTOMER_PROFILE_UPDATED' },
      }),
    ]);
    return this.getOwnProfile(userId);
  }

  async listCustomers() {
    const customers = await this.prisma.customer.findMany({
      where: { deletedAt: null },
      include: customerInclude,
      orderBy: { createdAt: 'desc' },
    });
    return customers.map((customer) => this.toProfile(customer));
  }

  async getCustomer(customerId: string) {
    return this.toProfile(await this.findCustomer(customerId, false));
  }

  async updateStatus(customerId: string, input: CustomerStatusInput, actorUserId: string) {
    const customer = await this.findCustomer(customerId, false);
    const updated = await this.prisma.customer.update({
      where: { id: customer.id },
      data: { status: input.status as CustomerStatus },
      include: customerInclude,
    });
    await this.prisma.auditLog.create({
      data: {
        actorUserId,
        entityType: 'Customer',
        entityId: customerId,
        action: 'CUSTOMER_STATUS_UPDATED',
        metadata: { status: input.status },
      },
    });
    return this.toProfile(updated);
  }

  async listOwnLocations(userId: string) {
    const customer = await this.findCustomerForUser(userId, true);
    return customer.savedLocations;
  }

  async createOwnLocation(userId: string, input: SavedLocationCreateInput) {
    const customer = await this.findCustomerForUser(userId, true);
    const location = await this.prisma.savedLocation.create({ data: { ...input, customerId: customer.id } });
    return location;
  }

  async updateOwnLocation(userId: string, locationId: string, input: SavedLocationUpdateInput) {
    const customer = await this.findCustomerForUser(userId, true);
    const location = await this.findLocation(customer.id, locationId);
    return this.prisma.savedLocation.update({ where: { id: location.id }, data: input });
  }

  async removeOwnLocation(userId: string, locationId: string) {
    const customer = await this.findCustomerForUser(userId, true);
    const location = await this.findLocation(customer.id, locationId);
    return this.prisma.savedLocation.update({ where: { id: location.id }, data: { deletedAt: new Date() } });
  }

  private async findCustomerForUser(userId: string, requireActive: boolean) {
    const customer = await this.prisma.customer.findUnique({ where: { userId }, include: customerInclude });
    if (!customer || customer.deletedAt || customer.user.status !== UserStatus.ACTIVE || (requireActive && customer.status !== CustomerStatus.ACTIVE)) {
      throw new NotFoundException('Customer profile not found');
    }
    return customer;
  }

  private async findCustomer(customerId: string, requireActive: boolean) {
    const customer = await this.prisma.customer.findUnique({ where: { id: customerId }, include: customerInclude });
    if (!customer || customer.deletedAt || customer.user.status !== UserStatus.ACTIVE || (requireActive && customer.status !== CustomerStatus.ACTIVE)) {
      throw new NotFoundException('Customer profile not found');
    }
    return customer;
  }

  private async findLocation(customerId: string, locationId: string) {
    const location = await this.prisma.savedLocation.findFirst({ where: { id: locationId, customerId, deletedAt: null } });
    if (!location) throw new ForbiddenException('Saved location does not belong to this customer');
    return location;
  }

  private toProfile(customer: CustomerWithDetails) {
    return {
      id: customer.id,
      user: customer.user,
      status: customer.status,
      preferredSettings: customer.preferredSettings,
      savedLocations: customer.savedLocations,
      createdAt: customer.createdAt,
      updatedAt: customer.updatedAt,
    };
  }
}
