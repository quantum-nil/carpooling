ALTER TABLE "Vehicle"
ADD COLUMN "capacity" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "make" TEXT,
ADD COLUMN "model" TEXT,
ADD COLUMN "metadata" JSONB,
ADD COLUMN "assignedEmployeeId" UUID;

CREATE INDEX "Vehicle_assignedEmployeeId_idx" ON "Vehicle"("assignedEmployeeId");

ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_assignedEmployeeId_fkey" FOREIGN KEY ("assignedEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
