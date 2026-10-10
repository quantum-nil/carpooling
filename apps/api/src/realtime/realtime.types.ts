import { z } from 'zod';

export const REALTIME_EVENTS = {
  RIDE_REQUESTED: 'ride.requested',
  DRIVER_OFFER: 'driver.offer',
  OFFER_ACCEPTED: 'offer.accepted',
  OFFER_REJECTED: 'offer.rejected',
  RIDE_STATUS_CHANGED: 'ride.status.changed',
  DRIVER_LOCATION_UPDATED: 'driver.location.updated',
  CHAT_MESSAGE: 'chat.message',
} as const;

export const REALTIME_COMMANDS = {
  SUBSCRIBE_RIDE: 'ride:subscribe',
  UNSUBSCRIBE_RIDE: 'ride:unsubscribe',
  ACCEPT_OFFER: 'driver:offer:accept',
  REJECT_OFFER: 'driver:offer:reject',
  UPDATE_LOCATION: 'driver:location:update',
  CHAT_JOIN: 'chat:join',
  CHAT_SEND: 'chat:send',
  CHAT_READ: 'chat:read',
} as const;

export const rideRoom = (rideId: string) => `ride:${rideId}`;
export const userRoom = (userId: string) => `user:${userId}`;
export const chatRoom = (conversationId: string) => `chat:${conversationId}`;

export const rideSubscriptionSchema = z.object({ rideId: z.string().uuid() }).strict();
export const offerCommandSchema = z.object({ offerId: z.string().uuid() }).strict();
export const locationCommandSchema = z.object({
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
}).strict();
export const chatJoinSchema = z.object({ rideId: z.string().uuid() }).strict();
export const chatSendSchema = z.object({ rideId: z.string().uuid(), body: z.string().trim().min(1).max(5_000) }).strict();
export const chatReadCommandSchema = z.object({ conversationId: z.string().uuid(), messageId: z.string().uuid() }).strict();

export type RideSubscription = z.infer<typeof rideSubscriptionSchema>;
export type OfferCommand = z.infer<typeof offerCommandSchema>;
export type LocationCommand = z.infer<typeof locationCommandSchema>;
