import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import { RoleCode } from '@prisma/client';
import type { Request } from 'express';
import { RequireRoles } from '../auth/require-roles.decorator';
import type { AuthenticatedRequest } from '../auth/auth.types';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { chatMessageSchema, chatReadSchema, type ChatMessageInput, type ChatReadInput } from './chat.schemas';
import { ChatService } from './chat.service';

@Controller('chat')
@RequireRoles(RoleCode.ADMIN, RoleCode.EMPLOYEE, RoleCode.CUSTOMER)
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  @Post('rides/:rideId/conversation')
  conversation(@Param('rideId') rideId: string, @Req() request: Request & AuthenticatedRequest) { return this.chat.getOrCreateConversation(rideId, request.user.sub); }

  @Get('conversations/:conversationId/messages')
  messages(@Param('conversationId') conversationId: string, @Req() request: Request & AuthenticatedRequest) { return this.chat.listMessages(conversationId, request.user.sub); }

  @Post('rides/:rideId/messages')
  send(@Param('rideId') rideId: string, @Req() request: Request & AuthenticatedRequest, @Body(new ZodValidationPipe(chatMessageSchema)) body: ChatMessageInput) { return this.chat.sendMessage(rideId, request.user.sub, body); }

  @Post('conversations/:conversationId/read')
  read(@Param('conversationId') conversationId: string, @Req() request: Request & AuthenticatedRequest, @Body(new ZodValidationPipe(chatReadSchema)) body: ChatReadInput) { return this.chat.markRead(conversationId, request.user.sub, body.messageId); }
}
