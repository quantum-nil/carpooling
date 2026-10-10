import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { CallDirection, CallStatus, Prisma, RideStatus, UserStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { InitiateCallInput } from './calling.schemas';
import { CALLING_PROVIDER, type CallingProvider } from './calling.types';

const callableRideStatuses: RideStatus[] = [RideStatus.REQUESTED, RideStatus.MATCHING, RideStatus.OFFERED, RideStatus.ACCEPTED, RideStatus.DRIVER_ARRIVING, RideStatus.IN_PROGRESS];

@Injectable()
export class CallingService {
  constructor(private readonly prisma: PrismaService, @Inject(CALLING_PROVIDER) private readonly provider: CallingProvider) {}

  async initiate(rideId: string, callerUserId: string, input: InitiateCallInput) {
    const ride = await this.prisma.ride.findUnique({
      where: { id: rideId },
      include: { requestedByCustomer: { select: { userId: true } }, driver: { select: { userId: true } }, participants: { include: { customer: { select: { userId: true } } } } },
    });
    if (!ride) throw new NotFoundException('Ride not found');
    if (!callableRideStatuses.includes(ride.status)) throw new BadRequestException('Calls are unavailable for this ride state');
    const customerIds = [ride.requestedByCustomer.userId, ...ride.participants.map((participant) => participant.customer.userId)];
    const driverUserId = ride.driver?.userId;
    const isCustomerDriverCall = Boolean(driverUserId && ((customerIds.includes(callerUserId) && input.targetUserId === driverUserId) || (callerUserId === driverUserId && customerIds.includes(input.targetUserId))));
    if (!isCustomerDriverCall) throw new ForbiddenException('Only the ride customer and assigned driver may call each other');

    const existing = await this.prisma.maskedCall.findUnique({ where: { rideId_callerUserId_idempotencyKey: { rideId, callerUserId, idempotencyKey: input.idempotencyKey } } });
    if (existing) {
      if (existing.calleeUserId !== input.targetUserId) throw new ConflictException('Idempotency key was already used for another call');
      return this.toPublicCall(existing);
    }
    const users = await this.prisma.user.findMany({ where: { id: { in: [callerUserId, input.targetUserId] }, status: UserStatus.ACTIVE, deletedAt: null }, select: { id: true, phoneNumber: true } });
    const caller = users.find((user) => user.id === callerUserId);
    const callee = users.find((user) => user.id === input.targetUserId);
    if (!caller?.phoneNumber || !callee?.phoneNumber) throw new BadRequestException('Both participants must have a verified phone number');
    const direction = customerIds.includes(callerUserId) ? CallDirection.CUSTOMER_TO_DRIVER : CallDirection.DRIVER_TO_CUSTOMER;
    let call;
    try {
      call = await this.prisma.$transaction(async (transaction) => {
        const created = await transaction.maskedCall.create({ data: { rideId, callerUserId, calleeUserId: input.targetUserId, direction, idempotencyKey: input.idempotencyKey, status: CallStatus.REQUESTED } });
        await transaction.auditLog.create({ data: { actorUserId: callerUserId, entityType: 'MaskedCall', entityId: created.id, action: 'CALL_REQUESTED', metadata: { rideId, direction } } });
        return created;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const duplicate = await this.prisma.maskedCall.findUnique({ where: { rideId_callerUserId_idempotencyKey: { rideId, callerUserId, idempotencyKey: input.idempotencyKey } } });
        if (duplicate && duplicate.calleeUserId === input.targetUserId) return this.toPublicCall(duplicate);
        throw new ConflictException('Idempotency key was already used');
      }
      throw error;
    }
    try {
      await this.prisma.maskedCall.update({ where: { id: call.id }, data: { status: CallStatus.INITIATING, startedAt: new Date() } });
      const providerCall = await this.provider.initiateCall({ callId: call.id, fromPhoneNumber: caller.phoneNumber, toPhoneNumber: callee.phoneNumber });
      const updated = await this.prisma.$transaction(async (transaction) => {
        const saved = await transaction.maskedCall.update({ where: { id: call.id }, data: { providerReference: providerCall.providerReference, status: providerCall.status } });
        await transaction.auditLog.create({ data: { actorUserId: callerUserId, entityType: 'MaskedCall', entityId: call.id, action: 'CALL_INITIATED', metadata: { provider: 'EXOTEL', status: providerCall.status } } });
        return saved;
      });
      return this.toPublicCall(updated);
    } catch (error) {
      const failureReason = error instanceof Error ? error.message.slice(0, 500) : 'Calling provider failed';
      const failed = await this.prisma.$transaction(async (transaction) => {
        const saved = await transaction.maskedCall.update({ where: { id: call.id }, data: { status: CallStatus.FAILED, failureReason } });
        await transaction.auditLog.create({ data: { actorUserId: callerUserId, entityType: 'MaskedCall', entityId: call.id, action: 'CALL_FAILED', metadata: { reason: failureReason } } });
        return saved;
      });
      return this.toPublicCall(failed);
    }
  }

  async getStatus(callId: string, actorUserId: string) {
    const call = await this.prisma.maskedCall.findUnique({ where: { id: callId } });
    if (!call) throw new NotFoundException('Call not found');
    if (call.callerUserId !== actorUserId && call.calleeUserId !== actorUserId) throw new ForbiddenException('You are not permitted to view this call');
    if (!call.providerReference || ([CallStatus.COMPLETED, CallStatus.FAILED, CallStatus.CANCELLED] as CallStatus[]).includes(call.status)) return this.toPublicCall(call);
    try {
      const providerStatus = await this.provider.getCallStatus(call.providerReference);
      const updated = await this.prisma.$transaction(async (transaction) => {
        const saved = await transaction.maskedCall.update({ where: { id: call.id }, data: { status: providerStatus.status, startedAt: providerStatus.startedAt, answeredAt: providerStatus.answeredAt, endedAt: providerStatus.endedAt, failureReason: providerStatus.failureReason } });
        if (saved.status !== call.status) await transaction.auditLog.create({ data: { actorUserId, entityType: 'MaskedCall', entityId: call.id, action: `CALL_${saved.status}`, metadata: { provider: call.provider } } });
        return saved;
      });
      return this.toPublicCall(updated);
    } catch { return this.toPublicCall(call); }
  }

  private toPublicCall(call: { id: string; rideId: string; callerUserId: string; calleeUserId: string; direction: CallDirection; status: CallStatus; failureReason: string | null; startedAt: Date | null; answeredAt: Date | null; endedAt: Date | null; createdAt: Date; updatedAt: Date }) {
    return { id: call.id, rideId: call.rideId, callerUserId: call.callerUserId, calleeUserId: call.calleeUserId, direction: call.direction, status: call.status, failureReason: call.failureReason, startedAt: call.startedAt, answeredAt: call.answeredAt, endedAt: call.endedAt, createdAt: call.createdAt, updatedAt: call.updatedAt };
  }
}
