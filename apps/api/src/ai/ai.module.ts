import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { AI_PROVIDER } from './ai.types';
import { OpenAiProvider } from './openai.provider';

@Module({
  imports: [ConfigModule, PrismaModule],
  controllers: [AiController],
  providers: [AiService, OpenAiProvider, { provide: AI_PROVIDER, useExisting: OpenAiProvider }],
  exports: [AiService],
})
export class AiModule {}
