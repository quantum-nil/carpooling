CREATE TYPE "RideOfferStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'EXPIRED');

CREATE TABLE "RideOffer" (
    "id" UUID NOT NULL,
    "rideId" UUID NOT NULL,
    "driverId" UUID NOT NULL,
    "vehicleId" UUID NOT NULL,
    "score" DECIMAL(12,4) NOT NULL,
    "distanceMeters" INTEGER NOT NULL,
    "etaSeconds" INTEGER NOT NULL,
    "routeDistanceMeters" INTEGER NOT NULL,
    "status" "RideOfferStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "respondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RideOffer_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RideOffer_rideId_driverId_key" ON "RideOffer"("rideId", "driverId");
CREATE INDEX "RideOffer_driverId_status_idx" ON "RideOffer"("driverId", "status");
CREATE INDEX "RideOffer_status_expiresAt_idx" ON "RideOffer"("status", "expiresAt");

ALTER TABLE "RideOffer" ADD CONSTRAINT "RideOffer_rideId_fkey" FOREIGN KEY ("rideId") REFERENCES "Ride"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RideOffer" ADD CONSTRAINT "RideOffer_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RideOffer" ADD CONSTRAINT "RideOffer_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
