import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import type { AppEnv } from '../config/env';
import { AuthController } from './auth.controller';
import { AccessTokenGuard } from './access-token.guard';
import { AuthService } from './auth.service';
import { RolesGuard } from './roles.guard';

@Global()
@Module({
  imports: [
    ConfigModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppEnv>) => ({
        secret: config.getOrThrow('AUTH_ACCESS_TOKEN_SECRET'),
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, AccessTokenGuard, RolesGuard],
  exports: [AuthService, AccessTokenGuard, RolesGuard, JwtModule],
})
export class AuthModule {}
