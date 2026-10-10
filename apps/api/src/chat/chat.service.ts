import { ForbiddenException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeEventService } from '../realtime/realtime-event.service';
import type { ChatMessageInput } from './chat.schemas';

const rideParticipantsInclude = {
  requestedByCustomer: { select: { userId: true } },
  driver: { select: { userId: true } },
  participants: { select: { customer: { select: { userId: true } } } },
} satisfies Prisma.RideInclude;

@Injectable()
export class ChatService {
  constructor(private readonly prisma: PrismaService, @Optional() private readonly realtime?: RealtimeEventService) {}

  async getOrCreateConversation(rideId: string, userId: string) {
    return this.prisma.$transaction((transaction) => this.ensureConversation(transaction, rideId, userId));
  }

  async listMessages(conversationId: string, userId: string) {
    await this.ensureParticipant(conversationId, userId);
    const messages = await this.prisma.chatMessage.findMany({ where: { conversationId }, include: { sender: { select: { id: true, displayName: true } }, reads: { where: { userId }, select: { readAt: true } } }, orderBy: { createdAt: 'desc' }, take: 100 });
    return messages.reverse().map((message) => ({ id: message.id, conversationId: message.conversationId, sender: message.sender, body: message.body, createdAt: message.createdAt, readAt: message.reads[0]?.readAt ?? null }));
  }

  async sendMessage(rideId: string, userId: string, input: ChatMessageInput) {
    const conversation = await this.getOrCreateConversation(rideId, userId);
    const message = await this.prisma.$transaction(async (transaction) => {
      const created = await transaction.chatMessage.create({ data: { conversationId: conversation.id, senderUserId: userId, body: input.body }, include: { sender: { select: { id: true, displayName: true } } } });
      await transaction.chatConversation.update({ where: { id: conversation.id }, data: { updatedAt: new Date() } });
      return created;
    });
    const payload = { id: message.id, conversationId: message.conversationId, rideId, sender: message.sender, body: message.body, createdAt: message.createdAt };
    this.realtime?.publishChatMessage(conversation.id, payload);
    return payload;
  }

  async markRead(conversationId: string, userId: string, messageId: string) {
    return this.prisma.$transaction(async (transaction) => {
      await this.ensureParticipantWithClient(transaction, conversationId, userId);
      const message = await transaction.chatMessage.findUnique({ where: { id: messageId } });
      if (!message || message.conversationId !== conversationId) throw new NotFoundException('Chat message not found');
      const read = await transaction.chatMessageRead.upsert({ where: { messageId_userId: { messageId, userId } }, update: { readAt: new Date() }, create: { messageId, userId } });
      await transaction.chatParticipant.update({ where: { conversationId_userId: { conversationId, userId } }, data: { lastReadAt: read.readAt } });
      return read;
    });
  }

  private async ensureConversation(transaction: Prisma.TransactionClient, rideId: string, userId: string) {
    const users = await this.authorizedUsers(transaction, rideId, userId);
    const conversation = await transaction.chatConversation.upsert({ where: { rideId }, update: {}, create: { rideId } });
    await Promise.all(users.map((participantId) => transaction.chatParticipant.upsert({ where: { conversationId_userId: { conversationId: conversation.id, userId: participantId } }, update: {}, create: { conversationId: conversation.id, userId: participantId } })));
    return conversation;
  }

  private async ensureParticipant(conversationId: string, userId: string) { return this.ensureParticipantWithClient(this.prisma, conversationId, userId); }

  private async ensureParticipantWithClient(client: Prisma.TransactionClient | PrismaService, conversationId: string, userId: string) {
    const participant = await client.chatParticipant.findUnique({ where: { conversationId_userId: { conversationId, userId } } });
    if (!participant) throw new ForbiddenException('You are not a participant in this conversation');
    return participant;
  }

  private async authorizedUsers(client: Prisma.TransactionClient, rideId: string, userId: string) {
    const ride = await client.ride.findUnique({ where: { id: rideId }, include: rideParticipantsInclude });
    if (!ride) throw new NotFoundException('Ride not found');
    const users = [...new Set([ride.requestedByCustomer.userId, ride.driver?.userId, ...ride.participants.map(({ customer }) => customer.userId)].filter((value): value is string => Boolean(value)))];
    if (!users.includes(userId)) throw new ForbiddenException('You are not an authorized ride participant');
    return users;
  }
}
