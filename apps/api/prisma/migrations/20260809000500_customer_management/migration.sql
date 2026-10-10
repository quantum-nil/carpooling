ALTER TABLE "Customer" ADD COLUMN "preferredSettings" JSONB;

CREATE TABLE "SavedLocation" (
    "id" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "latitude" DECIMAL(9,6) NOT NULL,
    "longitude" DECIMAL(9,6) NOT NULL,
    "placeId" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SavedLocation_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SavedLocation_customerId_deletedAt_idx" ON "SavedLocation"("customerId", "deletedAt");

ALTER TABLE "SavedLocation" ADD CONSTRAINT "SavedLocation_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
