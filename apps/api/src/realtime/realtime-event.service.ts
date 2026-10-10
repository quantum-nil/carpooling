import { Injectable } from '@nestjs/common';
import type { Server } from 'socket.io';
import { REALTIME_EVENTS, chatRoom, rideRoom, userRoom } from './realtime.types';

@Injectable()
export class RealtimeEventService {
  private server?: Server;

  bind(server: Server) { this.server = server; }

  publishRideRequested(rideId: string, customerUserId: string, payload: unknown) {
    this.server?.to(rideRoom(rideId)).emit(REALTIME_EVENTS.RIDE_REQUESTED, payload);
    this.server?.to(userRoom(customerUserId)).emit(REALTIME_EVENTS.RIDE_REQUESTED, payload);
  }

  publishDriverOffer(rideId: string, driverUserId: string, payload: unknown) {
    this.server?.to(rideRoom(rideId)).emit(REALTIME_EVENTS.DRIVER_OFFER, payload);
    this.server?.to(userRoom(driverUserId)).emit(REALTIME_EVENTS.DRIVER_OFFER, payload);
  }

  publishOfferAccepted(rideId: string, payload: unknown) { this.server?.to(rideRoom(rideId)).emit(REALTIME_EVENTS.OFFER_ACCEPTED, payload); }
  publishOfferRejected(rideId: string, payload: unknown) { this.server?.to(rideRoom(rideId)).emit(REALTIME_EVENTS.OFFER_REJECTED, payload); }
  publishRideStatusChanged(rideId: string, payload: unknown) { this.server?.to(rideRoom(rideId)).emit(REALTIME_EVENTS.RIDE_STATUS_CHANGED, payload); }
  publishDriverLocation(rideId: string, payload: unknown) { this.server?.to(rideRoom(rideId)).emit(REALTIME_EVENTS.DRIVER_LOCATION_UPDATED, payload); }
  publishDriverLocationToUser(userId: string, payload: unknown) { this.server?.to(userRoom(userId)).emit(REALTIME_EVENTS.DRIVER_LOCATION_UPDATED, payload); }
  publishChatMessage(conversationId: string, payload: unknown) { this.server?.to(chatRoom(conversationId)).emit(REALTIME_EVENTS.CHAT_MESSAGE, payload); }
  publishEmployeeUpdated(payload: unknown) { this.server?.emit('employee.updated', payload); }
  publishVehicleAssigned(payload: unknown) { this.server?.emit('vehicle.assigned', payload); }
}
