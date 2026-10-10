import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { ResendEmailProvider } from './email.provider';
import { FirebasePushProvider } from './push.provider';
import { NotificationController } from './notification.controller';
import { NotificationProcessor } from './notification.processor';
import { NotificationQueueService } from './notification-queue.service';
import { NotificationService } from './notification.service';
import { EMAIL_NOTIFICATION_PROVIDER, PUSH_NOTIFICATION_PROVIDER } from './notification.types';

@Module({
  imports: [ConfigModule, PrismaModule],
  controllers: [NotificationController],
  providers: [
    NotificationService,
    NotificationQueueService,
    NotificationProcessor,
    ResendEmailProvider,
    FirebasePushProvider,
    { provide: EMAIL_NOTIFICATION_PROVIDER, useExisting: ResendEmailProvider },
    { provide: PUSH_NOTIFICATION_PROVIDER, useExisting: FirebasePushProvider },
  ],
  exports: [NotificationService],
})
export class NotificationModule {}
