import { ForbiddenException } from '@nestjs/common';
import { DocumentStatus } from '@prisma/client';
import { DocumentService } from './document.service';

const employeeId = '00000000-0000-0000-0000-000000000001';
const ownerId = '00000000-0000-0000-0000-000000000002';
const otherId = '00000000-0000-0000-0000-000000000003';

const input = { documentType: 'DRIVING_LICENSE' as const, fileName: 'license.pdf', contentType: 'application/pdf' as const, sizeBytes: 1024, expiresAt: null };

function service(overrides: Record<string, unknown> = {}) {
  const document = { id: 'document', employeeId, documentType: input.documentType, storageKey: 'private/key', status: DocumentStatus.PENDING, fileName: input.fileName, contentType: input.contentType, sizeBytes: input.sizeBytes, uploadedAt: null, expiresAt: null, rejectionReason: null, verifiedAt: null, createdAt: new Date(), updatedAt: new Date() };
  const prisma = {
    user: { findUnique: jest.fn().mockResolvedValueOnce({ status: 'ACTIVE', deletedAt: null }).mockResolvedValueOnce({ roles: [{ role: { code: 'EMPLOYEE' } }] }) },
    employee: { findUnique: jest.fn().mockResolvedValue({ userId: ownerId, deletedAt: null }) },
    driverDocument: { create: jest.fn().mockResolvedValue(document), findUnique: jest.fn().mockResolvedValue(document), update: jest.fn().mockResolvedValue({ ...document, uploadedAt: new Date() }) },
    vehicleDocument: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    ...overrides,
  };
  const storage = { createUploadUrl: jest.fn().mockResolvedValue('https://private-upload.example'), objectExists: jest.fn().mockResolvedValue(true), createDownloadUrl: jest.fn().mockResolvedValue('https://private-download.example') };
  const config = { getOrThrow: jest.fn().mockReturnValue(300) };
  return { service: new DocumentService(prisma as never, storage as never, config as never), prisma, storage };
}

describe('DocumentService', () => {
  it('allows an employee to initiate their own private upload without exposing the storage key', async () => {
    const { service: documents, storage } = service();

    const result = await documents.initiateUpload('DRIVER', employeeId, ownerId, input);

    expect(storage.createUploadUrl).toHaveBeenCalled();
    expect(result.uploadUrl).toBe('https://private-upload.example');
    expect(result.document).not.toHaveProperty('storageKey');
  });

  it('rejects another employee from accessing the document', async () => {
    const { service: documents } = service();

    await expect(documents.initiateUpload('DRIVER', employeeId, otherId, input)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('requires the object to exist before completing upload', async () => {
    const { service: documents, storage } = service();
    storage.objectExists.mockResolvedValue(false);

    await expect(documents.completeUpload('DRIVER', 'document', ownerId)).rejects.toThrow('private storage');
  });
});
