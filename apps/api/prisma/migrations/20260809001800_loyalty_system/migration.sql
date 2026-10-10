CREATE TYPE "LoyaltyEarningBasis" AS ENUM ('FIXED', 'PER_CURRENCY_UNIT');
CREATE TYPE "LoyaltyTransactionType" AS ENUM ('EARN', 'REDEEM', 'ADJUSTMENT', 'REVERSAL');
CREATE TYPE "LoyaltyTransactionDirection" AS ENUM ('CREDIT', 'DEBIT');
CREATE TYPE "LoyaltyTransactionStatus" AS ENUM ('COMPLETED', 'FAILED', 'REVERSED');

CREATE TABLE "LoyaltyAccount" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "pointsBalance" INTEGER NOT NULL DEFAULT 0,
  "lifetimeEarned" INTEGER NOT NULL DEFAULT 0,
  "lifetimeRedeemed" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LoyaltyAccount_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LoyaltyEarningRule" (
  "id" UUID NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "basis" "LoyaltyEarningBasis" NOT NULL,
  "fixedPoints" INTEGER,
  "pointsPerUnit" DECIMAL(12,4),
  "minimumAmount" DECIMAL(12,2),
  "maximumPoints" INTEGER,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LoyaltyEarningRule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LoyaltyRedemptionRule" (
  "id" UUID NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "pointsPerUnit" INTEGER NOT NULL,
  "valueMinorPerUnit" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'INR',
  "minimumPoints" INTEGER NOT NULL,
  "maximumPoints" INTEGER,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LoyaltyRedemptionRule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LoyaltyTransaction" (
  "id" UUID NOT NULL,
  "accountId" UUID NOT NULL,
  "type" "LoyaltyTransactionType" NOT NULL,
  "direction" "LoyaltyTransactionDirection" NOT NULL,
  "status" "LoyaltyTransactionStatus" NOT NULL DEFAULT 'COMPLETED',
  "points" INTEGER NOT NULL,
  "balanceAfter" INTEGER NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "referenceId" TEXT NOT NULL,
  "earningRuleId" UUID,
  "redemptionRuleId" UUID,
  "redemptionValueMinor" INTEGER,
  "currency" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LoyaltyTransaction_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LoyaltyAccount_userId_key" ON "LoyaltyAccount"("userId");
CREATE INDEX "LoyaltyAccount_pointsBalance_idx" ON "LoyaltyAccount"("pointsBalance");
CREATE UNIQUE INDEX "LoyaltyEarningRule_code_key" ON "LoyaltyEarningRule"("code");
CREATE INDEX "LoyaltyEarningRule_active_code_idx" ON "LoyaltyEarningRule"("active", "code");
CREATE UNIQUE INDEX "LoyaltyRedemptionRule_code_key" ON "LoyaltyRedemptionRule"("code");
CREATE INDEX "LoyaltyRedemptionRule_active_code_idx" ON "LoyaltyRedemptionRule"("active", "code");
CREATE UNIQUE INDEX "LoyaltyTransaction_accountId_idempotencyKey_key" ON "LoyaltyTransaction"("accountId", "idempotencyKey");
CREATE INDEX "LoyaltyTransaction_accountId_createdAt_idx" ON "LoyaltyTransaction"("accountId", "createdAt");
CREATE INDEX "LoyaltyTransaction_referenceId_type_idx" ON "LoyaltyTransaction"("referenceId", "type");
CREATE INDEX "LoyaltyTransaction_status_createdAt_idx" ON "LoyaltyTransaction"("status", "createdAt");

ALTER TABLE "LoyaltyAccount" ADD CONSTRAINT "LoyaltyAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LoyaltyTransaction" ADD CONSTRAINT "LoyaltyTransaction_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "LoyaltyAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LoyaltyTransaction" ADD CONSTRAINT "LoyaltyTransaction_earningRuleId_fkey" FOREIGN KEY ("earningRuleId") REFERENCES "LoyaltyEarningRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "LoyaltyTransaction" ADD CONSTRAINT "LoyaltyTransaction_redemptionRuleId_fkey" FOREIGN KEY ("redemptionRuleId") REFERENCES "LoyaltyRedemptionRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;
