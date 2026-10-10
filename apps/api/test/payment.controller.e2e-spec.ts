import { Test } from '@nestjs/testing';
import request from 'supertest';
import { PaymentController } from '../src/payment/payment.controller';
import { PaymentService } from '../src/payment/payment.service';
import { AccessTokenGuard } from '../src/auth/access-token.guard';
import { RolesGuard } from '../src/auth/roles.guard';

describe('Payment API integration', () => {
  const service = {
    createOrder: jest.fn(),
    verifyPayment: jest.fn(),
    getPayment: jest.fn(),
    refund: jest.fn(),
    processWebhook: jest.fn(),
  };

  async function createApp() {
    const moduleRef = await Test.createTestingModule({
      controllers: [PaymentController],
      providers: [{ provide: PaymentService, useValue: service }],
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

  beforeEach(() => {
    jest.clearAllMocks();
    service.createOrder.mockResolvedValue({ id: 'payment-id', status: 'CREATED' });
    service.verifyPayment.mockResolvedValue({ id: 'payment-id', status: 'AUTHORIZED' });
    service.getPayment.mockResolvedValue({ id: 'payment-id', status: 'AUTHORIZED' });
    service.refund.mockResolvedValue({ id: 'refund-id', status: 'COMPLETED' });
    service.processWebhook.mockResolvedValue({ duplicate: false, status: 'PROCESSED' });
  });

  it('creates an order only with a valid, complete payload', async () => {
    const app = await createApp();
    await request(app.getHttpServer()).post('/payments/orders').send({
      amount: 125,
      currency: 'INR',
      referenceId: 'ride-id',
      idempotencyKey: 'payment-idempotency-key',
    }).expect(201);
    await request(app.getHttpServer()).post('/payments/orders').send({ amount: -1 }).expect(400);
    expect(service.createOrder).toHaveBeenCalledTimes(1);
    await app.close();
  });

  it('passes identity to owned payment operations', async () => {
    const app = await createApp();
    await request(app.getHttpServer()).get('/payments/payment-id').expect(200);
    await request(app.getHttpServer()).post('/payments/payment-id/verify').send({ orderId: 'order-id', paymentId: 'provider-payment-id', signature: 's'.repeat(32) }).expect(201);
    expect(service.getPayment).toHaveBeenCalledWith('customer-user-id', 'payment-id');
    expect(service.verifyPayment).toHaveBeenCalledWith('customer-user-id', 'payment-id', expect.any(Object));
    await app.close();
  });

  it('rejects malformed or unsigned webhooks before service processing', async () => {
    const app = await createApp();
    await request(app.getHttpServer()).post('/payments/webhooks/razorpay').send({ event: 'payment.captured' }).expect(400);
    expect(service.processWebhook).not.toHaveBeenCalled();
    await app.close();
  });
});
