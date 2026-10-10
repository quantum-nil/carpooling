import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import type { AppEnv } from '../config/env';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { AccessTokenGuard } from './access-token.guard';
import {
  loginSchema,
  passwordResetConfirmSchema,
  passwordResetRequestSchema,
  registerSchema,
  type LoginInput,
  type PasswordResetConfirmInput,
  type PasswordResetRequestInput,
  type RegisterInput,
} from './auth.schemas';
import { REFRESH_COOKIE_NAME, refreshCookieOptions } from './auth.constants';
import { AuthService } from './auth.service';
import type { AuthenticatedRequest } from './auth.types';
import type { AuthSession } from './auth.types';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService<AppEnv>,
  ) {}

  @Post('register')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @UsePipes(new ZodValidationPipe(registerSchema))
  async register(@Body() body: RegisterInput, @Res({ passthrough: true }) response: Response) {
    return this.withRefreshCookie(await this.auth.register(body), response);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @UsePipes(new ZodValidationPipe(loginSchema))
  async login(@Body() body: LoginInput, @Res({ passthrough: true }) response: Response) {
    return this.withRefreshCookie(await this.auth.login(body), response);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async refresh(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const result = await this.auth.refresh(request.cookies?.[REFRESH_COOKIE_NAME] ?? '');
    return this.withRefreshCookie(result, response);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    await this.auth.logout(request.cookies?.[REFRESH_COOKIE_NAME]);
    this.clearRefreshCookie(response);
  }

  @Get('me')
  @UseGuards(AccessTokenGuard)
  getCurrentUser(@Req() request: Request & AuthenticatedRequest) {
    return { user: request.user };
  }

  @Post('password-reset/request')
  @HttpCode(HttpStatus.ACCEPTED)
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @UsePipes(new ZodValidationPipe(passwordResetRequestSchema))
  async requestPasswordReset(@Body() body: PasswordResetRequestInput) {
    await this.auth.requestPasswordReset(body);
    return { message: 'If an account exists, password reset instructions will be sent.' };
  }

  @Post('password-reset/confirm')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @UsePipes(new ZodValidationPipe(passwordResetConfirmSchema))
  async confirmPasswordReset(@Body() body: PasswordResetConfirmInput) {
    await this.auth.confirmPasswordReset(body);
  }

  private withRefreshCookie(result: AuthSession, response: Response) {
    response.cookie(REFRESH_COOKIE_NAME, result.refreshToken, this.cookieOptions());
    return { accessToken: result.accessToken, user: result.user };
  }

  private clearRefreshCookie(response: Response) {
    response.clearCookie(REFRESH_COOKIE_NAME, { ...this.cookieOptions(), maxAge: undefined });
  }

  private cookieOptions() {
    return refreshCookieOptions(
      this.config.getOrThrow('NODE_ENV') === 'production',
      this.config.getOrThrow('AUTH_REFRESH_TOKEN_TTL_DAYS') * 86_400_000,
    );
  }
}
