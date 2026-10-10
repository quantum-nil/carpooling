CREATE TYPE "DriverStatus" AS ENUM ('PENDING_APPROVAL', 'ACTIVE', 'INACTIVE', 'REJECTED');
CREATE TYPE "DriverAvailability" AS ENUM ('AVAILABLE', 'UNAVAILABLE', 'OFFLINE');

ALTER TABLE "Employee"
ADD COLUMN "driverStatus" "DriverStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',
ADD COLUMN "availability" "DriverAvailability" NOT NULL DEFAULT 'OFFLINE',
ADD COLUMN "driverDecisionAt" TIMESTAMP(3),
ADD COLUMN "driverDecisionNote" TEXT,
ADD COLUMN "driverReviewedById" UUID;

CREATE INDEX "Employee_driverStatus_idx" ON "Employee"("driverStatus");
CREATE INDEX "Employee_availability_idx" ON "Employee"("availability");

ALTER TABLE "Employee" ADD CONSTRAINT "Employee_driverReviewedById_fkey" FOREIGN KEY ("driverReviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
