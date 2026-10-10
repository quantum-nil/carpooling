import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import cookieParser from 'cookie-parser';
import type { AppEnv } from './config/env';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });
  const config = app.get(ConfigService<AppEnv>);
  app.use(cookieParser());
  app.enableCors({ origin: config.getOrThrow('FRONTEND_ORIGIN'), credentials: true });
  await app.listen(config.getOrThrow('API_PORT'));
}

void bootstrap();
