import { ForbiddenException } from '@nestjs/common';
import { ChatService } from './chat.service';

const rideId = '00000000-0000-0000-0000-000000000001';
const customerId = '00000000-0000-0000-0000-000000000002';
const driverId = '00000000-0000-0000-0000-000000000003';
const conversationId = '00000000-0000-0000-0000-000000000004';

function ride() { return { requestedByCustomer: { userId: customerId }, driver: { userId: driverId }, participants: [] }; }

describe('ChatService', () => {
  it('creates a conversation only for an authorized ride participant', async () => {
    const tx = { ride: { findUnique: jest.fn().mockResolvedValue(ride()) }, chatConversation: { upsert: jest.fn().mockResolvedValue({ id: conversationId, rideId }) }, chatParticipant: { upsert: jest.fn().mockResolvedValue({}) } };
    const prisma = { $transaction: jest.fn((callback: (transaction: typeof tx) => unknown) => callback(tx)) };
    const service = new ChatService(prisma as never);

    const result = await service.getOrCreateConversation(rideId, customerId);

    expect(result.id).toBe(conversationId);
    expect(tx.chatParticipant.upsert).toHaveBeenCalledTimes(2);
  });

  it('rejects unauthorized conversation access', async () => {
    const tx = { ride: { findUnique: jest.fn().mockResolvedValue(ride()) }, chatConversation: { upsert: jest.fn() }, chatParticipant: { upsert: jest.fn() } };
    const prisma = { $transaction: jest.fn((callback: (transaction: typeof tx) => unknown) => callback(tx)) };
    const service = new ChatService(prisma as never);

    await expect(service.getOrCreateConversation(rideId, '00000000-0000-0000-0000-000000000005')).rejects.toBeInstanceOf(ForbiddenException);
    expect(tx.chatConversation.upsert).not.toHaveBeenCalled();
  });

  it('stores messages durably and publishes through the realtime service', async () => {
    const event = { publishChatMessage: jest.fn() };
    const conversation = { id: conversationId, rideId };
    const tx = {
      ride: { findUnique: jest.fn().mockResolvedValue(ride()) },
      chatConversation: { upsert: jest.fn().mockResolvedValue(conversation), update: jest.fn() },
      chatParticipant: { upsert: jest.fn().mockResolvedValue({}) },
      chatMessage: { create: jest.fn().mockResolvedValue({ id: 'message', conversationId, body: 'Hello', createdAt: new Date(), sender: { id: customerId, displayName: 'Customer' } }) },
    };
    const prisma = { $transaction: jest.fn((callback: (transaction: typeof tx) => unknown) => callback(tx)) };
    const service = new ChatService(prisma as never, event as never);

    const result = await service.sendMessage(rideId, customerId, { body: 'Hello' });

    expect(result.body).toBe('Hello');
    expect(event.publishChatMessage).toHaveBeenCalledWith(conversationId, expect.objectContaining({ id: 'message', rideId }));
  });
});
