ALTER TABLE "VehicleDocument"
  ADD COLUMN "fileName" TEXT NOT NULL DEFAULT 'legacy-document',
  ADD COLUMN "contentType" TEXT NOT NULL DEFAULT 'application/octet-stream',
  ADD COLUMN "sizeBytes" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "uploadedAt" TIMESTAMP(3),
  ADD COLUMN "rejectionReason" TEXT,
  ADD COLUMN "verifiedAt" TIMESTAMP(3),
  ADD COLUMN "verifiedById" UUID;

ALTER TABLE "DriverDocument"
  ADD COLUMN "fileName" TEXT NOT NULL DEFAULT 'legacy-document',
  ADD COLUMN "contentType" TEXT NOT NULL DEFAULT 'application/octet-stream',
  ADD COLUMN "sizeBytes" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "uploadedAt" TIMESTAMP(3),
  ADD COLUMN "rejectionReason" TEXT,
  ADD COLUMN "verifiedAt" TIMESTAMP(3),
  ADD COLUMN "verifiedById" UUID;

CREATE INDEX "VehicleDocument_status_expiresAt_idx" ON "VehicleDocument"("status", "expiresAt");
CREATE INDEX "DriverDocument_status_expiresAt_idx" ON "DriverDocument"("status", "expiresAt");

ALTER TABLE "VehicleDocument" ADD CONSTRAINT "VehicleDocument_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DriverDocument" ADD CONSTRAINT "DriverDocument_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
