import { ForbiddenException } from '@nestjs/common';
import { CallDirection, CallStatus, RideStatus } from '@prisma/client';
import { CallingService } from './calling.service';

const customerId = '00000000-0000-0000-0000-000000000001';
const driverId = '00000000-0000-0000-0000-000000000002';
const rideId = '00000000-0000-0000-0000-000000000003';

const call = { id: '00000000-0000-0000-0000-000000000004', rideId, callerUserId: customerId, calleeUserId: driverId, direction: CallDirection.CUSTOMER_TO_DRIVER, idempotencyKey: 'call-key-1', provider: 'EXOTEL', providerReference: 'provider-1', status: CallStatus.RINGING, failureReason: null, startedAt: new Date(), answeredAt: null, endedAt: null, createdAt: new Date(), updatedAt: new Date() };

function ride() { return { status: RideStatus.ACCEPTED, requestedByCustomer: { userId: customerId }, driver: { userId: driverId }, participants: [] }; }

describe('CallingService', () => {
  it('authorizes a participant and keeps phone numbers out of the response', async () => {
    const provider = { initiateCall: jest.fn().mockResolvedValue({ providerReference: 'provider-1', status: CallStatus.RINGING }), getCallStatus: jest.fn() };
    const created = { ...call, status: CallStatus.REQUESTED };
    const prisma = { ride: { findUnique: jest.fn().mockResolvedValue(ride()) }, user: { findMany: jest.fn().mockResolvedValue([{ id: customerId, phoneNumber: '+911111111111' }, { id: driverId, phoneNumber: '+922222222222' }]) }, maskedCall: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue(created), update: jest.fn().mockResolvedValue(call) }, $transaction: jest.fn((callback: (tx: any) => unknown) => callback({ maskedCall: { create: jest.fn().mockResolvedValue(created), update: jest.fn().mockResolvedValue(call) }, auditLog: { create: jest.fn().mockResolvedValue(undefined) } })) };
    const service = new CallingService(prisma as never, provider as never);

    const result = await service.initiate(rideId, customerId, { targetUserId: driverId, idempotencyKey: 'call-key-1' });

    expect(provider.initiateCall).toHaveBeenCalledWith({ callId: call.id, fromPhoneNumber: '+911111111111', toPhoneNumber: '+922222222222' });
    expect(result).not.toHaveProperty('fromPhoneNumber');
    expect(result).not.toHaveProperty('toPhoneNumber');
    expect(result).not.toHaveProperty('providerReference');
  });

  it('rejects a non-participant', async () => {
    const prisma = { ride: { findUnique: jest.fn().mockResolvedValue(ride()) } };
    const service = new CallingService(prisma as never, {} as never);
    await expect(service.initiate(rideId, '00000000-0000-0000-0000-000000000009', { targetUserId: driverId, idempotencyKey: 'call-key-1' })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('records provider failures without exposing provider details', async () => {
    const provider = { initiateCall: jest.fn().mockRejectedValue(new Error('provider unavailable')), getCallStatus: jest.fn() };
    const failed = { ...call, providerReference: null, status: CallStatus.FAILED, failureReason: 'provider unavailable' };
    const prisma = { ride: { findUnique: jest.fn().mockResolvedValue(ride()) }, user: { findMany: jest.fn().mockResolvedValue([{ id: customerId, phoneNumber: '+911111111111' }, { id: driverId, phoneNumber: '+922222222222' }]) }, maskedCall: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn(), update: jest.fn().mockResolvedValue(failed) }, $transaction: jest.fn((callback: (tx: any) => unknown) => callback({ maskedCall: { create: jest.fn().mockResolvedValue({ ...call, status: CallStatus.REQUESTED }), update: jest.fn().mockResolvedValue(failed) }, auditLog: { create: jest.fn().mockResolvedValue(undefined) } })) };
    const service = new CallingService(prisma as never, provider as never);
    const result = await service.initiate(rideId, customerId, { targetUserId: driverId, idempotencyKey: 'call-key-1' });
    expect(result.status).toBe(CallStatus.FAILED);
    expect(result).not.toHaveProperty('providerReference');
  });

  it('allows status access only to call participants', async () => {
    const prisma = { maskedCall: { findUnique: jest.fn().mockResolvedValue(call) }, $transaction: jest.fn((callback: (tx: any) => unknown) => callback({ maskedCall: { update: jest.fn().mockResolvedValue({ ...call, status: CallStatus.IN_PROGRESS }) }, auditLog: { create: jest.fn().mockResolvedValue(undefined) } })) };
    const provider = { initiateCall: jest.fn(), getCallStatus: jest.fn().mockResolvedValue({ status: CallStatus.IN_PROGRESS }) };
    const service = new CallingService(prisma as never, provider as never);
    await expect(service.getStatus(call.id, '00000000-0000-0000-0000-000000000009')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.getStatus(call.id, customerId)).resolves.toMatchObject({ status: CallStatus.IN_PROGRESS });
  });
});
