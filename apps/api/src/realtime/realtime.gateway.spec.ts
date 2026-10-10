import { RoleCode, UserStatus } from '@prisma/client';
import { WsException } from '@nestjs/websockets';
import { RealtimeGateway } from './realtime.gateway';
import { RealtimeEventService } from './realtime-event.service';

const id = '00000000-0000-0000-0000-000000000001';

function socket(overrides: Record<string, unknown> = {}) {
  return {
    handshake: { auth: { accessToken: 'token' }, headers: {} },
    join: jest.fn(), leave: jest.fn(), disconnect: jest.fn(), removeAllListeners: jest.fn(),
    ...overrides,
  } as any;
}

function gateway(role: RoleCode = RoleCode.CUSTOMER) {
  const jwt = { verifyAsync: jest.fn().mockResolvedValue({ sub: id, email: 'user@example.com', roles: [role] }) };
  const prisma = { user: { findUnique: jest.fn().mockResolvedValue({ id, email: 'user@example.com', status: UserStatus.ACTIVE, deletedAt: null, roles: [{ role: { code: role } }] }) } };
  const rides = { getRide: jest.fn().mockResolvedValue({ id }) };
  const offers = { acceptOffer: jest.fn(), rejectOffer: jest.fn() };
  const locations = { updateOwnLocation: jest.fn() };
  const events = new RealtimeEventService();
  const instance = new RealtimeGateway(jwt as never, { getOrThrow: jest.fn().mockReturnValue('a'.repeat(32)) } as never, prisma as never, rides as never, offers as never, locations as never, events);
  return { instance, jwt, prisma, rides, offers, locations };
}

describe('RealtimeGateway', () => {
  it('disconnects unauthenticated sockets', async () => {
    const { instance } = gateway();
    const client = socket({ handshake: { auth: {}, headers: {} } });
    await instance.handleConnection(client);
    expect(client.disconnect).toHaveBeenCalledWith(true);
  });

  it('authenticates and joins the private user room', async () => {
    const { instance } = gateway();
    const client = socket();
    await instance.handleConnection(client);
    expect(client.join).toHaveBeenCalledWith(`user:${id}`);
    expect(client.user.sub).toBe(id);
  });

  it('requires ride authorization before joining a ride room', async () => {
    const { instance, rides } = gateway();
    const client = socket({ user: { sub: id }, roles: [RoleCode.CUSTOMER] });
    rides.getRide.mockRejectedValue(new WsException('Forbidden'));
    await expect(instance.subscribe(client, { rideId: id })).rejects.toThrow();
    expect(client.join).not.toHaveBeenCalled();
  });

  it('rejects malformed location payloads before calling the location service', async () => {
    const { instance, locations } = gateway(RoleCode.EMPLOYEE);
    const client = socket({ user: { sub: id }, roles: [RoleCode.EMPLOYEE] });
    await expect(instance.updateLocation(client, { latitude: 120, longitude: 10 })).rejects.toThrow('Invalid event payload');
    expect(locations.updateOwnLocation).not.toHaveBeenCalled();
  });

  it('rejects customer offer actions', async () => {
    const { instance, offers } = gateway(RoleCode.CUSTOMER);
    const client = socket({ user: { sub: id }, roles: [RoleCode.CUSTOMER] });
    await expect(instance.acceptOffer(client, { offerId: id })).rejects.toThrow('Forbidden');
    expect(offers.acceptOffer).not.toHaveBeenCalled();
  });

  it('cleans up listeners after a WebSocket disconnect', () => {
    const { instance } = gateway();
    const client = socket();

    instance.handleDisconnect(client);

    expect(client.removeAllListeners).toHaveBeenCalledTimes(1);
  });
});
