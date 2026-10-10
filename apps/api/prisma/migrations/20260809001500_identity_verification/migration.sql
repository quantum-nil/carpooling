CREATE TYPE "IdentityVerificationStatus" AS ENUM ('REQUESTED', 'PENDING', 'VERIFIED', 'REJECTED', 'FAILED');

CREATE TABLE "IdentityVerification" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "provider" TEXT NOT NULL,
  "providerReference" TEXT,
  "status" "IdentityVerificationStatus" NOT NULL DEFAULT 'REQUESTED',
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "rejectionReason" TEXT,
  "failureReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "IdentityVerification_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "IdentityVerification_providerReference_key" ON "IdentityVerification"("providerReference");
CREATE INDEX "IdentityVerification_userId_status_createdAt_idx" ON "IdentityVerification"("userId", "status", "createdAt");
CREATE INDEX "IdentityVerification_providerReference_idx" ON "IdentityVerification"("providerReference");

ALTER TABLE "IdentityVerification" ADD CONSTRAINT "IdentityVerification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
