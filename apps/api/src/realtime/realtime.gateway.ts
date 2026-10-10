import { Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit, SubscribeMessage, WebSocketGateway, WebSocketServer, WsException } from '@nestjs/websockets';
import { RoleCode, UserStatus } from '@prisma/client';
import type { Server, Socket } from 'socket.io';
import { z } from 'zod';
import Redis from 'ioredis';
import { createAdapter } from '@socket.io/redis-adapter';
import type { AppEnv } from '../config/env';
import { DriverLocationService } from '../driver-location/driver-location.service';
import { OfferLifecycleService } from '../matching/offer-lifecycle.service';
import { PrismaService } from '../prisma/prisma.service';
import { RideService } from '../ride/ride.service';
import { RealtimeEventService } from './realtime-event.service';
import { REALTIME_COMMANDS, chatJoinSchema, chatReadCommandSchema, chatRoom, chatSendSchema, rideRoom, rideSubscriptionSchema, offerCommandSchema, locationCommandSchema, userRoom } from './realtime.types';
import type { AccessTokenPayload } from '../auth/auth.types';
import { ChatService } from '../chat/chat.service';

type RealtimeSocket = Socket & { user?: AccessTokenPayload; roles?: RoleCode[] };

@WebSocketGateway({ namespace: '/realtime', cors: { origin: process.env.FRONTEND_ORIGIN ?? 'http://localhost:3000', credentials: true } })
export class RealtimeGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server!: Server;
  private pubClient?: Redis;
  private subClient?: Redis;

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService<AppEnv>,
    private readonly prisma: PrismaService,
    private readonly rides: RideService,
    private readonly offers: OfferLifecycleService,
    private readonly locations: DriverLocationService,
    private readonly events: RealtimeEventService,
    @Optional() private readonly chat?: ChatService,
  ) {}

  afterInit(server: Server) {
    this.events.bind(server);
    try {
      this.pubClient = new Redis(this.config.getOrThrow('REDIS_URL'));
      this.subClient = this.pubClient.duplicate();
      server.adapter(createAdapter(this.pubClient as never, this.subClient as never));
    } catch {
      this.pubClient = undefined;
      this.subClient = undefined;
    }
  }

  async handleConnection(client: RealtimeSocket) {
    try {
      const token = this.tokenFrom(client);
      const payload = await this.jwt.verifyAsync<AccessTokenPayload>(token, { secret: this.config.getOrThrow('AUTH_ACCESS_TOKEN_SECRET') });
      const user = await this.prisma.user.findUnique({ where: { id: payload.sub }, include: { roles: { include: { role: true } } } });
      if (!user || user.status !== UserStatus.ACTIVE || user.deletedAt) throw new WsException('Authentication required');
      client.user = { sub: user.id, email: user.email, roles: user.roles.map(({ role }) => role.code) };
      client.roles = client.user.roles;
      await client.join(userRoom(user.id));
    } catch { client.disconnect(true); }
  }

  handleDisconnect(client: RealtimeSocket) { client.removeAllListeners(); }

  async onModuleDestroy() {
    await Promise.all([this.pubClient?.quit(), this.subClient?.quit()]);
  }

  @SubscribeMessage(REALTIME_COMMANDS.SUBSCRIBE_RIDE)
  async subscribe(client: RealtimeSocket, raw: unknown) {
    const user = this.requireUser(client);
    const input = this.parse(rideSubscriptionSchema, raw);
    await this.rides.getRide(input.rideId, user.sub);
    await client.join(rideRoom(input.rideId));
    return { subscribed: true, rideId: input.rideId };
  }

  @SubscribeMessage(REALTIME_COMMANDS.UNSUBSCRIBE_RIDE)
  async unsubscribe(client: RealtimeSocket, raw: unknown) {
    const user = this.requireUser(client);
    const input = this.parse(rideSubscriptionSchema, raw);
    await this.rides.getRide(input.rideId, user.sub);
    await client.leave(rideRoom(input.rideId));
    return { subscribed: false, rideId: input.rideId };
  }

  @SubscribeMessage(REALTIME_COMMANDS.ACCEPT_OFFER)
  acceptOffer(client: RealtimeSocket, raw: unknown) { return this.offerAction(client, raw, true); }

  @SubscribeMessage(REALTIME_COMMANDS.REJECT_OFFER)
  rejectOffer(client: RealtimeSocket, raw: unknown) { return this.offerAction(client, raw, false); }

  @SubscribeMessage(REALTIME_COMMANDS.UPDATE_LOCATION)
  async updateLocation(client: RealtimeSocket, raw: unknown) {
    const user = this.requireRole(client, RoleCode.EMPLOYEE);
    const input = this.parse(locationCommandSchema, raw);
    const result = await this.locations.updateOwnLocation(user.sub, input);
    this.events.publishDriverLocationToUser(user.sub, result);
    const rides = await this.prisma.ride.findMany({
      where: { driver: { userId: user.sub }, status: { in: ['ACCEPTED', 'DRIVER_ARRIVING', 'IN_PROGRESS'] } },
      select: { id: true },
    });
    rides.forEach((ride) => this.events.publishDriverLocation(ride.id, result));
    return result;
  }

  @SubscribeMessage(REALTIME_COMMANDS.CHAT_JOIN)
  async joinChat(client: RealtimeSocket, raw: unknown) {
    const user = this.requireUser(client);
    if (!this.chat) throw new WsException('Chat service unavailable');
    const input = this.parse(chatJoinSchema, raw);
    const conversation = await this.chat.getOrCreateConversation(input.rideId, user.sub);
    await client.join(chatRoom(conversation.id));
    return { conversationId: conversation.id, rideId: input.rideId, joined: true };
  }

  @SubscribeMessage(REALTIME_COMMANDS.CHAT_SEND)
  async sendChat(client: RealtimeSocket, raw: unknown) {
    const user = this.requireUser(client);
    if (!this.chat) throw new WsException('Chat service unavailable');
    const input = this.parse(chatSendSchema, raw);
    return this.chat.sendMessage(input.rideId, user.sub, { body: input.body });
  }

  @SubscribeMessage(REALTIME_COMMANDS.CHAT_READ)
  async readChat(client: RealtimeSocket, raw: unknown) {
    const user = this.requireUser(client);
    if (!this.chat) throw new WsException('Chat service unavailable');
    const input = this.parse(chatReadCommandSchema, raw);
    return this.chat.markRead(input.conversationId, user.sub, input.messageId);
  }

  private async offerAction(client: RealtimeSocket, raw: unknown, accept: boolean) {
    const user = this.requireRole(client, RoleCode.EMPLOYEE);
    const input = this.parse(offerCommandSchema, raw);
    const result = accept ? await this.offers.acceptOffer(input.offerId, user.sub) : await this.offers.rejectOffer(input.offerId, user.sub);
    if (result && 'rideId' in result) {
      const event = accept ? 'accepted' : 'rejected';
      if (accept) this.events.publishOfferAccepted(result.rideId, result); else this.events.publishOfferRejected(result.rideId, result);
      return { action: event, offer: result };
    }
    return { action: accept ? 'accepted' : 'rejected', offer: result };
  }

  private requireUser(client: RealtimeSocket) { if (!client.user) throw new WsException('Authentication required'); return client.user; }
  private requireRole(client: RealtimeSocket, role: RoleCode) { const user = this.requireUser(client); if (!client.roles?.includes(role)) throw new WsException('Forbidden'); return user; }
  private tokenFrom(client: RealtimeSocket) {
    const auth = client.handshake.auth?.accessToken;
    const header = client.handshake.headers.authorization;
    const token = typeof auth === 'string' ? auth : typeof header === 'string' && header.startsWith('Bearer ') ? header.slice(7) : undefined;
    if (!token) throw new WsException('Authentication required');
    return token;
  }
  private parse<T>(schema: z.ZodType<T>, raw: unknown): T { const result = schema.safeParse(raw); if (!result.success) throw new WsException('Invalid event payload'); return result.data; }
}
