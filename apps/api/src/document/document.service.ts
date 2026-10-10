import { ConflictException, ForbiddenException, Inject, Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { DocumentStatus, DriverDocumentType, Prisma, RoleCode, UserStatus, VehicleDocumentType } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import type { AppEnv } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { OBJECT_STORAGE_PROVIDER, type DocumentResource, type ObjectStorageProvider } from './document.types';
import type { UploadMetadataInput, VerificationInput } from './document.schemas';

@Injectable()
export class DocumentService {
  constructor(private readonly prisma: PrismaService, @Inject(OBJECT_STORAGE_PROVIDER) private readonly storage: ObjectStorageProvider, private readonly config: ConfigService<AppEnv>) {}

  async initiateUpload(resource: DocumentResource, targetId: string, actorUserId: string, input: UploadMetadataInput) {
    await this.assertTargetAccess(resource, targetId, actorUserId);
    this.assertDocumentType(resource, input.documentType);
    const storageKey = `documents/${resource.toLowerCase()}/${targetId}/${randomUUID()}`;
    let document;
    try {
      document = resource === 'DRIVER'
        ? await this.prisma.driverDocument.create({ data: { employeeId: targetId, documentType: input.documentType as DriverDocumentType, storageKey, fileName: input.fileName, contentType: input.contentType, sizeBytes: input.sizeBytes, expiresAt: input.expiresAt, createdById: actorUserId } })
        : await this.prisma.vehicleDocument.create({ data: { vehicleId: targetId, documentType: input.documentType as VehicleDocumentType, storageKey, fileName: input.fileName, contentType: input.contentType, sizeBytes: input.sizeBytes, expiresAt: input.expiresAt, createdById: actorUserId } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('A document of this type already exists');
      throw error;
    }
    try {
      const uploadUrl = await this.storage.createUploadUrl({ key: storageKey, contentType: input.contentType, sizeBytes: input.sizeBytes }, this.config.getOrThrow('DOCUMENT_UPLOAD_URL_TTL_SECONDS'));
      return { document: this.toPublicDocument(resource, document), uploadUrl, uploadUrlExpiresInSeconds: this.config.getOrThrow('DOCUMENT_UPLOAD_URL_TTL_SECONDS') };
    } catch (error) {
      await (resource === 'DRIVER' ? this.prisma.driverDocument.delete({ where: { id: document.id } }) : this.prisma.vehicleDocument.delete({ where: { id: document.id } }));
      throw error;
    }
  }

  async completeUpload(resource: DocumentResource, documentId: string, actorUserId: string) {
    const document = await this.findOwnedDocument(resource, documentId, actorUserId);
    if (!(await this.storage.objectExists(document.storageKey))) throw new BadRequestException('Uploaded object was not found in private storage');
    const updated = resource === 'DRIVER' ? await this.prisma.driverDocument.update({ where: { id: documentId }, data: { uploadedAt: new Date() } }) : await this.prisma.vehicleDocument.update({ where: { id: documentId }, data: { uploadedAt: new Date() } });
    return this.toPublicDocument(resource, updated);
  }

  async getAccessUrl(resource: DocumentResource, documentId: string, actorUserId: string) {
    const document = await this.findOwnedDocument(resource, documentId, actorUserId);
    if (document.expiresAt && document.expiresAt <= new Date()) {
      await this.setExpired(resource, documentId);
      throw new ForbiddenException('Expired documents cannot be accessed');
    }
    if (!document.uploadedAt) throw new ConflictException('Document upload has not been completed');
    return { url: await this.storage.createDownloadUrl(document.storageKey, this.config.getOrThrow('DOCUMENT_DOWNLOAD_URL_TTL_SECONDS')), expiresInSeconds: this.config.getOrThrow('DOCUMENT_DOWNLOAD_URL_TTL_SECONDS') };
  }

  async getMetadata(resource: DocumentResource, documentId: string, actorUserId: string) {
    const document = await this.findOwnedDocument(resource, documentId, actorUserId);
    if (document.expiresAt && document.expiresAt <= new Date()) await this.setExpired(resource, documentId);
    return this.toPublicDocument(resource, document);
  }

  async verify(resource: DocumentResource, documentId: string, actorUserId: string, input: VerificationInput) {
    await this.assertAdmin(actorUserId);
    const document = await this.findDocument(resource, documentId);
    if (input.status === DocumentStatus.VERIFIED && (!document.uploadedAt || (document.expiresAt && document.expiresAt <= new Date()))) throw new ConflictException('Only a completed, non-expired upload can be verified');
    const updated = resource === 'DRIVER'
      ? await this.prisma.driverDocument.update({ where: { id: documentId }, data: { status: input.status, rejectionReason: input.status === DocumentStatus.REJECTED ? input.rejectionReason : null, verifiedAt: new Date(), verifiedById: actorUserId } })
      : await this.prisma.vehicleDocument.update({ where: { id: documentId }, data: { status: input.status, rejectionReason: input.status === DocumentStatus.REJECTED ? input.rejectionReason : null, verifiedAt: new Date(), verifiedById: actorUserId } });
    await this.prisma.auditLog.create({ data: { actorUserId, entityType: resource === 'DRIVER' ? 'DriverDocument' : 'VehicleDocument', entityId: documentId, action: input.status === DocumentStatus.VERIFIED ? 'DOCUMENT_VERIFIED' : 'DOCUMENT_REJECTED', metadata: input.rejectionReason ? { reason: input.rejectionReason } : undefined } });
    return this.toPublicDocument(resource, updated);
  }

  async list(resource: DocumentResource, targetId: string, actorUserId: string) {
    await this.assertTargetAccess(resource, targetId, actorUserId);
    const documents = resource === 'DRIVER' ? await this.prisma.driverDocument.findMany({ where: { employeeId: targetId }, orderBy: { createdAt: 'desc' } }) : await this.prisma.vehicleDocument.findMany({ where: { vehicleId: targetId }, orderBy: { createdAt: 'desc' } });
    return documents.map((document) => this.toPublicDocument(resource, document));
  }

  private async findOwnedDocument(resource: DocumentResource, documentId: string, actorUserId: string) {
    const document = await this.findDocument(resource, documentId);
    const targetId = resource === 'DRIVER' ? (document as { employeeId: string }).employeeId : (document as { vehicleId: string }).vehicleId;
    await this.assertTargetAccess(resource, targetId, actorUserId);
    return document;
  }

  private findDocument(resource: DocumentResource, documentId: string) {
    return resource === 'DRIVER' ? this.prisma.driverDocument.findUnique({ where: { id: documentId } }).then((document) => { if (!document) throw new NotFoundException('Driver document not found'); return document; }) : this.prisma.vehicleDocument.findUnique({ where: { id: documentId } }).then((document) => { if (!document) throw new NotFoundException('Vehicle document not found'); return document; });
  }

  private async assertTargetAccess(resource: DocumentResource, targetId: string, actorUserId: string) {
    await this.assertActiveUser(actorUserId);
    if (await this.isAdmin(actorUserId)) return;
    if (resource === 'DRIVER') {
      const employee = await this.prisma.employee.findUnique({ where: { id: targetId }, select: { userId: true, deletedAt: true } });
      if (!employee || employee.deletedAt || employee.userId !== actorUserId) throw new ForbiddenException('You are not permitted to access this driver document');
    } else {
      const vehicle = await this.prisma.vehicle.findUnique({ where: { id: targetId }, select: { deletedAt: true, assignedEmployee: { select: { userId: true } } } });
      if (!vehicle || vehicle.deletedAt || vehicle.assignedEmployee?.userId !== actorUserId) throw new ForbiddenException('You are not permitted to access this vehicle document');
    }
  }

  private async assertAdmin(userId: string) { await this.assertActiveUser(userId); if (!(await this.isAdmin(userId))) throw new ForbiddenException('Administrator access required'); }
  private async assertActiveUser(userId: string) { const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { status: true, deletedAt: true } }); if (!user || user.status !== UserStatus.ACTIVE || user.deletedAt) throw new ForbiddenException('Access denied'); }
  private async isAdmin(userId: string) { const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { roles: { select: { role: { select: { code: true } } } } } }); return user?.roles.some(({ role }) => role.code === RoleCode.ADMIN) ?? false; }
  private async setExpired(resource: DocumentResource, documentId: string) { if (resource === 'DRIVER') await this.prisma.driverDocument.updateMany({ where: { id: documentId, status: { not: DocumentStatus.EXPIRED } }, data: { status: DocumentStatus.EXPIRED } }); else await this.prisma.vehicleDocument.updateMany({ where: { id: documentId, status: { not: DocumentStatus.EXPIRED } }, data: { status: DocumentStatus.EXPIRED } }); }
  private assertDocumentType(resource: DocumentResource, type: DriverDocumentType | VehicleDocumentType) { const driver = Object.values(DriverDocumentType).includes(type as DriverDocumentType); const vehicle = Object.values(VehicleDocumentType).includes(type as VehicleDocumentType); if ((resource === 'DRIVER' && !driver) || (resource === 'VEHICLE' && !vehicle)) throw new BadRequestException('Document type does not match resource'); }
  private toPublicDocument(resource: DocumentResource, document: { id: string; documentType: string; status: DocumentStatus; fileName?: string | null; contentType?: string | null; sizeBytes?: number | null; uploadedAt?: Date | null; expiresAt: Date | null; rejectionReason?: string | null; verifiedAt?: Date | null; createdAt: Date; updatedAt: Date }) { return { id: document.id, resource, documentType: document.documentType, status: document.status, fileName: document.fileName, contentType: document.contentType, sizeBytes: document.sizeBytes, uploadedAt: document.uploadedAt, expiresAt: document.expiresAt, rejectionReason: document.rejectionReason, verifiedAt: document.verifiedAt, createdAt: document.createdAt, updatedAt: document.updatedAt }; }
}
