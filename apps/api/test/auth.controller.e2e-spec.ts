import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AuthController } from '../src/auth/auth.controller';
import { AuthService } from '../src/auth/auth.service';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

describe('AuthController', () => {
  it('sets the refresh token as an httpOnly cookie without returning it', async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: {
            login: jest.fn().mockResolvedValue({
              accessToken: 'access-token',
              refreshToken: 'refresh-token',
              user: { id: 'user-id', email: 'person@example.com', status: 'ACTIVE', roles: ['CUSTOMER'] },
            }),
          },
        },
        {
          provide: ConfigService,
          useValue: { getOrThrow: (key: string) => ({ NODE_ENV: 'test', AUTH_REFRESH_TOKEN_TTL_DAYS: 30 })[key] },
        },
        { provide: JwtService, useValue: {} },
      ],
    }).compile();
    const app = moduleRef.createNestApplication();
    await app.init();

    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'person@example.com', password: 'a-secure-password' })
      .expect(200);

    expect(response.body).toEqual({
      accessToken: 'access-token',
      user: { id: 'user-id', email: 'person@example.com', status: 'ACTIVE', roles: ['CUSTOMER'] },
    });
    expect(response.headers['set-cookie'][0]).toContain('refresh_token=refresh-token');
    expect(response.headers['set-cookie'][0]).toContain('HttpOnly');
    expect(response.body.refreshToken).toBeUndefined();
    await app.close();
  });
});
