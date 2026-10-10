import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Req } from '@nestjs/common';
import { RoleCode } from '@prisma/client';
import type { Request } from 'express';
import { RequireRoles } from '../auth/require-roles.decorator';
import type { AuthenticatedRequest } from '../auth/auth.types';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { DocumentService } from './document.service';
import { uploadMetadataSchema, verificationSchema, type UploadMetadataInput, type VerificationInput } from './document.schemas';
import type { DocumentResource } from './document.types';

@Controller('documents')
export class DocumentController {
  constructor(private readonly documents: DocumentService) {}

  @Post('drivers/:employeeId')
  @RequireRoles(RoleCode.ADMIN, RoleCode.EMPLOYEE)
  initiateDriverUpload(@Param('employeeId') employeeId: string, @Req() request: Request & AuthenticatedRequest, @Body(new ZodValidationPipe(uploadMetadataSchema)) body: UploadMetadataInput) { return this.documents.initiateUpload('DRIVER', employeeId, request.user.sub, body); }

  @Post('vehicles/:vehicleId')
  @RequireRoles(RoleCode.ADMIN, RoleCode.EMPLOYEE)
  initiateVehicleUpload(@Param('vehicleId') vehicleId: string, @Req() request: Request & AuthenticatedRequest, @Body(new ZodValidationPipe(uploadMetadataSchema)) body: UploadMetadataInput) { return this.documents.initiateUpload('VEHICLE', vehicleId, request.user.sub, body); }

  @Get('drivers/:employeeId')
  @RequireRoles(RoleCode.ADMIN, RoleCode.EMPLOYEE)
  listDriverDocuments(@Param('employeeId') employeeId: string, @Req() request: Request & AuthenticatedRequest) { return this.documents.list('DRIVER', employeeId, request.user.sub); }

  @Get('vehicles/:vehicleId')
  @RequireRoles(RoleCode.ADMIN, RoleCode.EMPLOYEE)
  listVehicleDocuments(@Param('vehicleId') vehicleId: string, @Req() request: Request & AuthenticatedRequest) { return this.documents.list('VEHICLE', vehicleId, request.user.sub); }

  @Post(':resource/:documentId/complete')
  @RequireRoles(RoleCode.ADMIN, RoleCode.EMPLOYEE)
  complete(@Param('resource') resource: DocumentResource, @Param('documentId') documentId: string, @Req() request: Request & AuthenticatedRequest) { return this.documents.completeUpload(this.resource(resource), documentId, request.user.sub); }

  @Get(':resource/:documentId')
  @RequireRoles(RoleCode.ADMIN, RoleCode.EMPLOYEE)
  metadata(@Param('resource') resource: DocumentResource, @Param('documentId') documentId: string, @Req() request: Request & AuthenticatedRequest) { return this.documents.getMetadata(this.resource(resource), documentId, request.user.sub); }

  @Get(':resource/:documentId/access-url')
  @RequireRoles(RoleCode.ADMIN, RoleCode.EMPLOYEE)
  accessUrl(@Param('resource') resource: DocumentResource, @Param('documentId') documentId: string, @Req() request: Request & AuthenticatedRequest) { return this.documents.getAccessUrl(this.resource(resource), documentId, request.user.sub); }

  @Patch(':resource/:documentId/verification')
  @RequireRoles(RoleCode.ADMIN)
  verify(@Param('resource') resource: DocumentResource, @Param('documentId') documentId: string, @Req() request: Request & AuthenticatedRequest, @Body(new ZodValidationPipe(verificationSchema)) body: VerificationInput) { return this.documents.verify(this.resource(resource), documentId, request.user.sub, body); }

  private resource(value: string): DocumentResource { const normalized = value.toUpperCase(); if (normalized !== 'DRIVER' && normalized !== 'VEHICLE') throw new BadRequestException('Invalid document resource'); return normalized; }
}
