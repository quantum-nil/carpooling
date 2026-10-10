import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AccessTokenGuard } from '../src/auth/access-token.guard';
import { RolesGuard } from '../src/auth/roles.guard';
import { RideController } from '../src/ride/ride.controller';
import { RideService } from '../src/ride/ride.service';

describe('Ride request workflow API', () => {
  const service = {
    createRide: jest.fn(),
    getRideRequest: jest.fn(),
    cancelRideRequest: jest.fn(),
    getCurrentRides: jest.fn(),
    getRideHistory: jest.fn(),
  };

  async function createApp() {
    const moduleRef = await Test.createTestingModule({
      controllers: [RideController],
      providers: [{ provide: RideService, useValue: service }],
    })
      .overrideGuard(AccessTokenGuard)
      .useValue({
        canActivate: (context: { switchToHttp: () => { getRequest: () => { user?: unknown } } }) => {
          context.switchToHttp().getRequest().user = { sub: 'customer-user-id' };
          return true;
        },
      })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();
    const app = moduleRef.createNestApplication();
    await app.init();
    return app;
  }

  const validBody = {
    pickupAddress: 'Home', pickupLatitude: 12.9716, pickupLongitude: 77.5946,
    destinationAddress: 'Office', destinationLatitude: 12.9352, destinationLongitude: 77.6245,
    scheduledAt: '2099-01-01T10:00:00.000Z', seatsRequested: 2,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service.createRide.mockResolvedValue({ id: 'ride-id', status: 'REQUESTED', requests: [{ status: 'PENDING' }] });
    service.getRideRequest.mockResolvedValue({ id: 'request-id', status: 'PENDING' });
    service.cancelRideRequest.mockResolvedValue({ id: 'request-id', status: 'CANCELLED' });
  });

  it('creates a valid request', async () => {
    const app = await createApp();
    await request(app.getHttpServer()).post('/rides/requests').send(validBody).expect(201).expect({
      id: 'ride-id', status: 'REQUESTED', requests: [{ status: 'PENDING' }],
    });
    expect(service.createRide).toHaveBeenCalledWith('customer-user-id', expect.objectContaining({ seatsRequested: 2 }));
    await app.close();
  });

  it('rejects invalid pickup and passenger data', async () => {
    const app = await createApp();
    await request(app.getHttpServer()).post('/rides/requests').send({ ...validBody, pickupLatitude: 91, seatsRequested: 0 }).expect(400);
    expect(service.createRide).not.toHaveBeenCalled();
    await app.close();
  });

  it('views and cancels an owned request', async () => {
    const app = await createApp();
    await request(app.getHttpServer()).get('/rides/requests/request-id').expect(200).expect({ id: 'request-id', status: 'PENDING' });
    await request(app.getHttpServer()).post('/rides/requests/request-id/cancel').send({ cancellationReason: 'Plans changed' }).expect(201).expect({ id: 'request-id', status: 'CANCELLED' });
    expect(service.cancelRideRequest).toHaveBeenCalledWith('request-id', 'customer-user-id', 'Plans changed');
    await app.close();
  });

  it('rejects unauthorized access and duplicate/invalid cancellation', async () => {
    service.getRideRequest.mockRejectedValueOnce(new ForbiddenException('not owner'));
    service.cancelRideRequest.mockRejectedValueOnce(new BadRequestException('already cancelled'));
    const app = await createApp();
    await request(app.getHttpServer()).get('/rides/requests/request-id').expect(403);
    await request(app.getHttpServer()).post('/rides/requests/request-id/cancel').send({ cancellationReason: 'Again' }).expect(400);
    await app.close();
  });
});
