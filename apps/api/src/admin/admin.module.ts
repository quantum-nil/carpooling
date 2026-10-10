import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AnalyticsService } from './analytics.service';

@Module({ imports: [PrismaModule], controllers: [AdminController], providers: [AdminService, AnalyticsService] })
export class AdminModule {}
