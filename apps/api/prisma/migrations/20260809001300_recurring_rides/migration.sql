CREATE TYPE "RecurringRideStatus" AS ENUM ('ACTIVE', 'CANCELLED', 'COMPLETED');
CREATE TYPE "RecurringRideOccurrenceStatus" AS ENUM ('PENDING', 'GENERATING', 'GENERATED', 'FAILED', 'CANCELLED');

CREATE TABLE "RecurringRide" (
  "id" UUID NOT NULL,
  "customerId" UUID NOT NULL,
  "pickupAddress" TEXT NOT NULL,
  "pickupLatitude" DECIMAL(9,6) NOT NULL,
  "pickupLongitude" DECIMAL(9,6) NOT NULL,
  "pickupPlaceId" TEXT,
  "destinationAddress" TEXT NOT NULL,
  "destinationLatitude" DECIMAL(9,6) NOT NULL,
  "destinationLongitude" DECIMAL(9,6) NOT NULL,
  "destinationPlaceId" TEXT,
  "scheduledTime" TEXT NOT NULL,
  "timeZone" TEXT NOT NULL DEFAULT 'UTC',
  "daysOfWeek" INTEGER[] NOT NULL,
  "startDate" TIMESTAMP(3) NOT NULL,
  "endDate" TIMESTAMP(3) NOT NULL,
  "seatsRequested" INTEGER NOT NULL,
  "estimatedFare" DECIMAL(12,2),
  "currency" VARCHAR(3) NOT NULL DEFAULT 'INR',
  "status" "RecurringRideStatus" NOT NULL DEFAULT 'ACTIVE',
  "cancelledAt" TIMESTAMP(3),
  "cancellationReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RecurringRide_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RecurringRideOccurrence" (
  "id" UUID NOT NULL,
  "recurringRideId" UUID NOT NULL,
  "scheduledAt" TIMESTAMP(3) NOT NULL,
  "status" "RecurringRideOccurrenceStatus" NOT NULL DEFAULT 'PENDING',
  "rideId" UUID,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "lastError" TEXT,
  "generatedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RecurringRideOccurrence_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Ride" ADD COLUMN "recurringRideId" UUID;

CREATE UNIQUE INDEX "RecurringRideOccurrence_rideId_key" ON "RecurringRideOccurrence"("rideId");
CREATE UNIQUE INDEX "RecurringRideOccurrence_recurringRideId_scheduledAt_key" ON "RecurringRideOccurrence"("recurringRideId", "scheduledAt");
CREATE INDEX "RecurringRide_customerId_status_idx" ON "RecurringRide"("customerId", "status");
CREATE INDEX "RecurringRide_status_startDate_endDate_idx" ON "RecurringRide"("status", "startDate", "endDate");
CREATE INDEX "RecurringRideOccurrence_status_scheduledAt_idx" ON "RecurringRideOccurrence"("status", "scheduledAt");
CREATE INDEX "Ride_recurringRideId_scheduledAt_idx" ON "Ride"("recurringRideId", "scheduledAt");

ALTER TABLE "RecurringRide" ADD CONSTRAINT "RecurringRide_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Ride" ADD CONSTRAINT "Ride_recurringRideId_fkey" FOREIGN KEY ("recurringRideId") REFERENCES "RecurringRide"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RecurringRideOccurrence" ADD CONSTRAINT "RecurringRideOccurrence_recurringRideId_fkey" FOREIGN KEY ("recurringRideId") REFERENCES "RecurringRide"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecurringRideOccurrence" ADD CONSTRAINT "RecurringRideOccurrence_rideId_fkey" FOREIGN KEY ("rideId") REFERENCES "Ride"("id") ON DELETE SET NULL ON UPDATE CASCADE;
