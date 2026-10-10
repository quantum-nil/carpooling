import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import type { AppEnv } from '../config/env';
import type { AccessTokenPayload } from './auth.types';

@Injectable()
export class AccessTokenGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService<AppEnv>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request & { user?: AccessTokenPayload }>();
    const header = request.headers?.authorization;
    if (!header?.startsWith('Bearer ')) throw new UnauthorizedException('Access token required');

    try {
      request.user = await this.jwt.verifyAsync<AccessTokenPayload>(header.slice(7), {
        secret: this.config.getOrThrow('AUTH_ACCESS_TOKEN_SECRET'),
      });
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired access token');
    }
  }
}
