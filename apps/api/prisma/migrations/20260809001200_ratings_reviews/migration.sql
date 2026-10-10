CREATE TYPE "RatingDirection" AS ENUM ('CUSTOMER_TO_DRIVER', 'DRIVER_TO_CUSTOMER');
CREATE TYPE "RatingStatus" AS ENUM ('PUBLISHED', 'REPORTED', 'HIDDEN');
CREATE TYPE "RatingReportStatus" AS ENUM ('OPEN', 'REVIEWED', 'DISMISSED');

CREATE TABLE "Rating" (
  "id" UUID NOT NULL,
  "rideId" UUID NOT NULL,
  "raterUserId" UUID NOT NULL,
  "ratedUserId" UUID NOT NULL,
  "direction" "RatingDirection" NOT NULL,
  "score" INTEGER NOT NULL,
  "reviewText" TEXT,
  "status" "RatingStatus" NOT NULL DEFAULT 'PUBLISHED',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Rating_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RatingReport" (
  "id" UUID NOT NULL,
  "ratingId" UUID NOT NULL,
  "reporterUserId" UUID NOT NULL,
  "reason" TEXT NOT NULL,
  "status" "RatingReportStatus" NOT NULL DEFAULT 'OPEN',
  "reviewedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RatingReport_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Rating_rideId_raterUserId_ratedUserId_key" ON "Rating"("rideId", "raterUserId", "ratedUserId");
CREATE UNIQUE INDEX "RatingReport_ratingId_reporterUserId_key" ON "RatingReport"("ratingId", "reporterUserId");
CREATE INDEX "Rating_ratedUserId_status_createdAt_idx" ON "Rating"("ratedUserId", "status", "createdAt");
CREATE INDEX "Rating_rideId_createdAt_idx" ON "Rating"("rideId", "createdAt");
CREATE INDEX "RatingReport_status_createdAt_idx" ON "RatingReport"("status", "createdAt");

ALTER TABLE "Rating" ADD CONSTRAINT "Rating_rideId_fkey" FOREIGN KEY ("rideId") REFERENCES "Ride"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Rating" ADD CONSTRAINT "Rating_raterUserId_fkey" FOREIGN KEY ("raterUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Rating" ADD CONSTRAINT "Rating_ratedUserId_fkey" FOREIGN KEY ("ratedUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RatingReport" ADD CONSTRAINT "RatingReport_ratingId_fkey" FOREIGN KEY ("ratingId") REFERENCES "Rating"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RatingReport" ADD CONSTRAINT "RatingReport_reporterUserId_fkey" FOREIGN KEY ("reporterUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
