CREATE TYPE "CallDirection" AS ENUM ('CUSTOMER_TO_DRIVER', 'DRIVER_TO_CUSTOMER');
CREATE TYPE "CallStatus" AS ENUM ('REQUESTED', 'INITIATING', 'RINGING', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'CANCELLED');

CREATE TABLE "MaskedCall" (
  "id" UUID NOT NULL,
  "rideId" UUID NOT NULL,
  "callerUserId" UUID NOT NULL,
  "calleeUserId" UUID NOT NULL,
  "direction" "CallDirection" NOT NULL,
  "provider" TEXT NOT NULL DEFAULT 'EXOTEL',
  "providerReference" TEXT,
  "idempotencyKey" TEXT NOT NULL,
  "status" "CallStatus" NOT NULL DEFAULT 'REQUESTED',
  "failureReason" TEXT,
  "startedAt" TIMESTAMP(3),
  "answeredAt" TIMESTAMP(3),
  "endedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MaskedCall_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MaskedCall_providerReference_key" ON "MaskedCall"("providerReference");
CREATE UNIQUE INDEX "MaskedCall_rideId_callerUserId_idempotencyKey_key" ON "MaskedCall"("rideId", "callerUserId", "idempotencyKey");
CREATE INDEX "MaskedCall_rideId_createdAt_idx" ON "MaskedCall"("rideId", "createdAt");
CREATE INDEX "MaskedCall_callerUserId_createdAt_idx" ON "MaskedCall"("callerUserId", "createdAt");
CREATE INDEX "MaskedCall_calleeUserId_createdAt_idx" ON "MaskedCall"("calleeUserId", "createdAt");
CREATE INDEX "MaskedCall_status_createdAt_idx" ON "MaskedCall"("status", "createdAt");

ALTER TABLE "MaskedCall" ADD CONSTRAINT "MaskedCall_rideId_fkey" FOREIGN KEY ("rideId") REFERENCES "Ride"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MaskedCall" ADD CONSTRAINT "MaskedCall_callerUserId_fkey" FOREIGN KEY ("callerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MaskedCall" ADD CONSTRAINT "MaskedCall_calleeUserId_fkey" FOREIGN KEY ("calleeUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
