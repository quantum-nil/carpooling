CREATE TYPE "RideStatus" AS ENUM ('REQUESTED', 'MATCHING', 'OFFERED', 'ACCEPTED', 'DRIVER_ARRIVING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'EXPIRED');
CREATE TYPE "RideRequestStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'CANCELLED', 'EXPIRED');
CREATE TYPE "RideParticipantStatus" AS ENUM ('CONFIRMED', 'CANCELLED', 'COMPLETED');

CREATE TABLE "Ride" (
    "id" UUID NOT NULL,
    "requestedByCustomerId" UUID NOT NULL,
    "driverId" UUID,
    "vehicleId" UUID,
    "pickupAddress" TEXT NOT NULL,
    "pickupLatitude" DECIMAL(9,6) NOT NULL,
    "pickupLongitude" DECIMAL(9,6) NOT NULL,
    "pickupPlaceId" TEXT,
    "destinationAddress" TEXT NOT NULL,
    "destinationLatitude" DECIMAL(9,6) NOT NULL,
    "destinationLongitude" DECIMAL(9,6) NOT NULL,
    "destinationPlaceId" TEXT,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "status" "RideStatus" NOT NULL DEFAULT 'REQUESTED',
    "seatCapacity" INTEGER NOT NULL,
    "estimatedFare" DECIMAL(12,2),
    "finalFare" DECIMAL(12,2),
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "cancelledAt" TIMESTAMP(3),
    "cancelledByUserId" UUID,
    "cancellationReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Ride_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Ride_requestedByCustomerId_createdAt_idx" ON "Ride"("requestedByCustomerId", "createdAt");
CREATE INDEX "Ride_driverId_status_idx" ON "Ride"("driverId", "status");
CREATE INDEX "Ride_vehicleId_idx" ON "Ride"("vehicleId");
CREATE INDEX "Ride_status_scheduledAt_idx" ON "Ride"("status", "scheduledAt");

CREATE TABLE "RideRequest" (
    "id" UUID NOT NULL,
    "rideId" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "seatsRequested" INTEGER NOT NULL,
    "status" "RideRequestStatus" NOT NULL DEFAULT 'PENDING',
    "respondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RideRequest_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "RideRequest_rideId_customerId_key" ON "RideRequest"("rideId", "customerId");
CREATE INDEX "RideRequest_customerId_status_idx" ON "RideRequest"("customerId", "status");
CREATE INDEX "RideRequest_rideId_status_idx" ON "RideRequest"("rideId", "status");

CREATE TABLE "RideParticipant" (
    "id" UUID NOT NULL,
    "rideId" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "seats" INTEGER NOT NULL,
    "status" "RideParticipantStatus" NOT NULL DEFAULT 'CONFIRMED',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RideParticipant_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "RideParticipant_rideId_customerId_key" ON "RideParticipant"("rideId", "customerId");
CREATE INDEX "RideParticipant_rideId_status_idx" ON "RideParticipant"("rideId", "status");
CREATE INDEX "RideParticipant_customerId_status_idx" ON "RideParticipant"("customerId", "status");

ALTER TABLE "Ride" ADD CONSTRAINT "Ride_requestedByCustomerId_fkey" FOREIGN KEY ("requestedByCustomerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Ride" ADD CONSTRAINT "Ride_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Ride" ADD CONSTRAINT "Ride_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Ride" ADD CONSTRAINT "Ride_cancelledByUserId_fkey" FOREIGN KEY ("cancelledByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RideRequest" ADD CONSTRAINT "RideRequest_rideId_fkey" FOREIGN KEY ("rideId") REFERENCES "Ride"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RideRequest" ADD CONSTRAINT "RideRequest_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RideParticipant" ADD CONSTRAINT "RideParticipant_rideId_fkey" FOREIGN KEY ("rideId") REFERENCES "Ride"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RideParticipant" ADD CONSTRAINT "RideParticipant_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
