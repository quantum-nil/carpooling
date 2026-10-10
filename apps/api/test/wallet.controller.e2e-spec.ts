import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AccessTokenGuard } from '../src/auth/access-token.guard';
import { RolesGuard } from '../src/auth/roles.guard';
import { WalletController } from '../src/wallet/wallet.controller';
import { WalletService } from '../src/wallet/wallet.service';

describe('Wallet API integration', () => {
  const service = {
    getWallet: jest.fn(),
    history: jest.fn(),
    credit: jest.fn(),
    debit: jest.fn(),
    refund: jest.fn(),
  };

  async function createApp(canAuthorize = true) {
    const moduleRef = await Test.createTestingModule({
      controllers: [WalletController],
      providers: [{ provide: WalletService, useValue: service }],
    })
      .overrideGuard(AccessTokenGuard)
      .useValue({
        canActivate: (context: { switchToHttp: () => { getRequest: () => { user?: unknown } } }) => {
          context.switchToHttp().getRequest().user = { sub: 'customer-user-id' };
          return true;
        },
      })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => canAuthorize })
      .compile();
    const app = moduleRef.createNestApplication();
    await app.init();
    return app;
  }

  beforeEach(() => {
    jest.clearAllMocks();
    service.getWallet.mockResolvedValue({ id: 'wallet-id', balance: '10.00', balanceSource: 'COMPLETED_LEDGER' });
    service.history.mockResolvedValue([]);
    service.credit.mockResolvedValue({ id: 'transaction-id' });
  });

  it('reads only the authenticated user wallet and history', async () => {
    const app = await createApp();
    await request(app.getHttpServer()).get('/wallet').expect(200);
    await request(app.getHttpServer()).get('/wallet/transactions').expect(200);
    expect(service.getWallet).toHaveBeenCalledWith('customer-user-id');
    expect(service.history).toHaveBeenCalledWith('customer-user-id');
    await app.close();
  });

  it('validates mutation payloads before calling the ledger service', async () => {
    const app = await createApp();
    await request(app.getHttpServer()).post('/wallet/target-user/credit').send({ amount: -5, idempotencyKey: 'x', referenceId: 'ref' }).expect(400);
    expect(service.credit).not.toHaveBeenCalled();
    await app.close();
  });

  it('rejects unauthorized wallet mutations', async () => {
    const app = await createApp(false);
    await request(app.getHttpServer()).post('/wallet/target-user/credit').send({ amount: 5, idempotencyKey: 'x', referenceId: 'ref' }).expect(403);
    expect(service.credit).not.toHaveBeenCalled();
    await app.close();
  });
});
