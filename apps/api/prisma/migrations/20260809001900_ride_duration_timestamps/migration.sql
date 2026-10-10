ALTER TABLE "Ride" ADD COLUMN "startedAt" TIMESTAMP(3);
ALTER TABLE "Ride" ADD COLUMN "completedAt" TIMESTAMP(3);

CREATE INDEX "Ride_completedAt_idx" ON "Ride"("completedAt");
CREATE INDEX "Ride_cancelledAt_idx" ON "Ride"("cancelledAt");
