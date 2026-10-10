ALTER TABLE "RideRequest" ADD COLUMN "idempotencyKey" TEXT NOT NULL DEFAULT md5(random()::text || clock_timestamp()::text);
CREATE UNIQUE INDEX "RideRequest_customerId_idempotencyKey_key" ON "RideRequest"("customerId", "idempotencyKey");
