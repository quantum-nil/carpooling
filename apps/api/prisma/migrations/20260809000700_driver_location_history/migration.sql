CREATE TABLE "DriverLocationHistory" (
    "id" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "latitude" DECIMAL(9,6) NOT NULL,
    "longitude" DECIMAL(9,6) NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DriverLocationHistory_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DriverLocationHistory_employeeId_recordedAt_idx" ON "DriverLocationHistory"("employeeId", "recordedAt");
CREATE INDEX "DriverLocationHistory_recordedAt_idx" ON "DriverLocationHistory"("recordedAt");

ALTER TABLE "DriverLocationHistory" ADD CONSTRAINT "DriverLocationHistory_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
