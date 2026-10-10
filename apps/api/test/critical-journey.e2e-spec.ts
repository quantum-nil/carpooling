import { Test } from '@nestjs/testing';
import request from 'supertest';
import { ConfigService } from '@nestjs/config';
import { AuthController } from '../src/auth/auth.controller';
import { AuthService } from '../src/auth/auth.service';
import { AccessTokenGuard } from '../src/auth/access-token.guard';
import { RolesGuard } from '../src/auth/roles.guard';
import { RideController } from '../src/ride/ride.controller';
import { RideService } from '../src/ride/ride.service';
import { OfferLifecycleController } from '../src/matching/offer-lifecycle.controller';
import { OfferLifecycleService } from '../src/matching/offer-lifecycle.service';
import { PaymentController } from '../src/payment/payment.controller';
import { PaymentService } from '../src/payment/payment.service';
import { RatingController } from '../src/rating/rating.controller';
import { RatingService } from '../src/rating/rating.service';

describe('Critical customer-to-completion journey', () => {
  const customerUserId = '00000000-0000-0000-0000-000000000001';
  const driverUserId = '00000000-0000-0000-0000-000000000002';
  const rideId = '00000000-0000-0000-0000-000000000003';
  const offerId = '00000000-0000-0000-0000-000000000004';
  const paymentId = '00000000-0000-0000-0000-000000000005';
  const ride = { id: rideId, status: 'REQUESTED', driver: null as unknown };
  const offer = { id: offerId, rideId, status: 'PENDING', driverId: 'employee-id' };

  const auth = { register: jest.fn(), login: jest.fn() };
  const rides = { createRide: jest.fn(), getCurrentRides: jest.fn(), transitionRide: jest.fn() };
  const offers = { listOffers: jest.fn(), acceptOffer: jest.fn() };
  const payments = { createOrder: jest.fn(), verifyPayment: jest.fn() };
  const ratings = { createRating: jest.fn() };

  async function createApp() {
    const moduleRef = await Test.createTestingModule({
      controllers: [AuthController, RideController, OfferLifecycleController, PaymentController, RatingController],
      providers: [
        { provide: AuthService, useValue: auth },
        { provide: ConfigService, useValue: { getOrThrow: (key: string) => ({ NODE_ENV: 'test', AUTH_REFRESH_TOKEN_TTL_DAYS: 30 })[key] } },
        { provide: RideService, useValue: rides },
        { provide: OfferLifecycleService, useValue: offers },
        { provide: PaymentService, useValue: payments },
        { provide: RatingService, useValue: ratings },
      ],
    })
      .overrideGuard(AccessTokenGuard)
      .useValue({
        canActivate: (context: { switchToHttp: () => { getRequest: () => { headers: Record<string, string>; user?: unknown } } }) => {
          const request = context.switchToHttp().getRequest();
          request.user = { sub: request.headers['x-user'] ?? customerUserId };
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

  beforeEach(() => {
    jest.clearAllMocks();
    ride.status = 'REQUESTED';
    ride.driver = null;
    offer.status = 'PENDING';
    auth.register.mockResolvedValue({ accessToken: 'customer-token', refreshToken: 'customer-refresh', user: { id: customerUserId, roles: ['CUSTOMER'] } });
    auth.login.mockResolvedValue({ accessToken: 'customer-token', refreshToken: 'customer-refresh', user: { id: customerUserId, roles: ['CUSTOMER'] } });
    rides.createRide.mockImplementation(async () => ride);
    rides.getCurrentRides.mockImplementation(async () => [ride]);
    rides.transitionRide.mockImplementation(async (_id: string, input: { status: string }) => { ride.status = input.status; return ride; });
    offers.listOffers.mockResolvedValue([offer]);
    offers.acceptOffer.mockImplementation(async () => { offer.status = 'ACCEPTED'; ride.status = 'ACCEPTED'; ride.driver = { userId: driverUserId }; return offer; });
    payments.createOrder.mockResolvedValue({ id: paymentId, status: 'CREATED' });
    payments.verifyPayment.mockResolvedValue({ id: paymentId, status: 'AUTHORIZED' });
    ratings.createRating.mockResolvedValue({ id: 'rating-id', score: 5 });
  });

  it('covers registration through payment and post-ride rating', async () => {
    const app = await createApp();
    const rideBody = {
      pickupAddress: 'Home', pickupLatitude: 12.9716, pickupLongitude: 77.5946,
      destinationAddress: 'Office', destinationLatitude: 12.9352, destinationLongitude: 77.6245,
      scheduledAt: '2099-01-01T10:00:00.000Z', seatsRequested: 1, estimatedFare: 125, currency: 'INR',
    };

    await request(app.getHttpServer()).post('/auth/register').send({ email: 'customer@example.com', password: 'a-secure-password' }).expect(201);
    await request(app.getHttpServer()).post('/auth/login').send({ email: 'customer@example.com', password: 'a-secure-password' }).expect(200);
    await request(app.getHttpServer()).post('/rides/requests').set('x-user', customerUserId).send(rideBody).expect(201);
    expect(ride.status).toBe('REQUESTED');

    await request(app.getHttpServer()).get('/driver/offers').set('x-user', driverUserId).expect(200);
    await request(app.getHttpServer()).post(`/driver/offers/${offerId}/accept`).set('x-user', driverUserId).expect(201);
    await request(app.getHttpServer()).get('/rides/current').set('x-user', customerUserId).expect(200);
    expect(ride.driver).toEqual({ userId: driverUserId });

    await request(app.getHttpServer()).post(`/rides/${rideId}/transition`).set('x-user', driverUserId).send({ status: 'DRIVER_ARRIVING' }).expect(201);
    await request(app.getHttpServer()).post(`/rides/${rideId}/transition`).set('x-user', driverUserId).send({ status: 'IN_PROGRESS' }).expect(201);
    await request(app.getHttpServer()).post(`/rides/${rideId}/transition`).set('x-user', driverUserId).send({ status: 'COMPLETED' }).expect(201);

    await request(app.getHttpServer()).post('/payments/orders').set('x-user', customerUserId).send({ amount: 125, currency: 'INR', referenceId: rideId, idempotencyKey: 'payment-key' }).expect(201);
    await request(app.getHttpServer()).post(`/payments/${paymentId}/verify`).set('x-user', customerUserId).send({ orderId: 'order-id', paymentId: 'provider-payment-id', signature: 's'.repeat(32) }).expect(201);
    await request(app.getHttpServer()).post(`/ratings/rides/${rideId}`).set('x-user', customerUserId).send({ ratedUserId: driverUserId, score: 5, reviewText: 'Great ride' }).expect(201);

    expect(ride.status).toBe('COMPLETED');
    expect(payments.verifyPayment).toHaveBeenCalled();
    expect(ratings.createRating).toHaveBeenCalledWith(rideId, customerUserId, expect.objectContaining({ ratedUserId: driverUserId, score: 5 }));
    await app.close();
  });
});
