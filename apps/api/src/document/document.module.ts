import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { DocumentController } from './document.controller';
import { DocumentService } from './document.service';
import { OBJECT_STORAGE_PROVIDER } from './document.types';
import { S3CompatibleStorageProvider } from './s3-storage.provider';

@Module({
  imports: [ConfigModule, PrismaModule],
  controllers: [DocumentController],
  providers: [DocumentService, S3CompatibleStorageProvider, { provide: OBJECT_STORAGE_PROVIDER, useExisting: S3CompatibleStorageProvider }],
  exports: [DocumentService],
})
export class DocumentModule {}
