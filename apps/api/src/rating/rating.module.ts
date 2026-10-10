import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { RatingController } from './rating.controller';
import { RatingService } from './rating.service';

@Module({ imports: [PrismaModule], controllers: [RatingController], providers: [RatingService], exports: [RatingService] })
export class RatingModule {}
