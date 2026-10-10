import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppEnv } from '../config/env';
import type { ObjectStorageProvider, ObjectUploadInput } from './document.types';

@Injectable()
export class S3CompatibleStorageProvider implements ObjectStorageProvider {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(private readonly config: ConfigService<AppEnv>) {
    this.bucket = config.getOrThrow('S3_BUCKET');
    this.client = new S3Client({
      region: config.getOrThrow('S3_REGION'),
      endpoint: config.get('S3_ENDPOINT'),
      forcePathStyle: config.getOrThrow('S3_FORCE_PATH_STYLE'),
      credentials: { accessKeyId: config.getOrThrow('S3_ACCESS_KEY_ID'), secretAccessKey: config.getOrThrow('S3_SECRET_ACCESS_KEY') },
    });
  }

  createUploadUrl(input: ObjectUploadInput, expiresInSeconds: number) {
    return getSignedUrl(this.client, new PutObjectCommand({ Bucket: this.bucket, Key: input.key, ContentType: input.contentType, ContentLength: input.sizeBytes }), { expiresIn: expiresInSeconds });
  }

  createDownloadUrl(key: string, expiresInSeconds: number) {
    return getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.bucket, Key: key }), { expiresIn: expiresInSeconds });
  }

  async objectExists(key: string) {
    try { await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key })); return true; } catch { return false; }
  }
}
