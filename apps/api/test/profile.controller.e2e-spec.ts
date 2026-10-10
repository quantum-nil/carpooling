import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AccessTokenGuard } from '../src/auth/access-token.guard';
import { RolesGuard } from '../src/auth/roles.guard';
import { ProfileController } from '../src/profile/profile.controller';
import { ProfileService } from '../src/profile/profile.service';

describe('ProfileController', () => {
  it('protects and updates the current profile through the API', async () => {
    const profiles = {
      updateOwnProfile: jest.fn().mockResolvedValue({ id: 'user-id', displayName: 'Updated' }),
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [ProfileController],
      providers: [{ provide: ProfileService, useValue: profiles }],
    })
      .overrideGuard(AccessTokenGuard)
      .useValue({
        canActivate: (context: { switchToHttp: () => { getRequest: () => { user?: unknown } } }) => {
          context.switchToHttp().getRequest().user = { sub: 'user-id' };
          return true;
        },
      })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();
    const app = moduleRef.createNestApplication();
    await app.init();

    await request(app.getHttpServer())
      .patch('/profile')
      .send({ displayName: 'Updated' })
      .expect(200)
      .expect({ id: 'user-id', displayName: 'Updated' });
    expect(profiles.updateOwnProfile).toHaveBeenCalledWith('user-id', { displayName: 'Updated' });

    await request(app.getHttpServer()).patch('/profile').send({ roles: ['ADMIN'] }).expect(400);
    await app.close();
  });
});
