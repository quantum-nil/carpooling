export type DocumentResource = 'DRIVER' | 'VEHICLE';

export interface ObjectUploadInput {
  key: string;
  contentType: string;
  sizeBytes: number;
}

export interface ObjectStorageProvider {
  createUploadUrl(input: ObjectUploadInput, expiresInSeconds: number): Promise<string>;
  createDownloadUrl(key: string, expiresInSeconds: number): Promise<string>;
  objectExists(key: string): Promise<boolean>;
}

export const OBJECT_STORAGE_PROVIDER = Symbol('OBJECT_STORAGE_PROVIDER');
