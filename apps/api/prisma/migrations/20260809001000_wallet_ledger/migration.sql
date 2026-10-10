CREATE TYPE "WalletTransactionType" AS ENUM ('CREDIT', 'DEBIT', 'REFUND');
CREATE TYPE "WalletTransactionDirection" AS ENUM ('CREDIT', 'DEBIT');
CREATE TYPE "WalletTransactionStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED', 'REVERSED');

CREATE TABLE "Wallet" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "currency" VARCHAR(3) NOT NULL DEFAULT 'INR',
  "balance" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Wallet_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WalletTransaction" (
  "id" UUID NOT NULL,
  "walletId" UUID NOT NULL,
  "type" "WalletTransactionType" NOT NULL,
  "direction" "WalletTransactionDirection" NOT NULL,
  "status" "WalletTransactionStatus" NOT NULL DEFAULT 'COMPLETED',
  "amount" DECIMAL(12,2) NOT NULL,
  "currency" VARCHAR(3) NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "referenceId" TEXT NOT NULL,
  "balanceAfter" DECIMAL(12,2) NOT NULL,
  "refundOfTransactionId" UUID,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WalletTransaction_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Wallet_userId_key" ON "Wallet"("userId");
CREATE UNIQUE INDEX "WalletTransaction_refundOfTransactionId_key" ON "WalletTransaction"("refundOfTransactionId");
CREATE UNIQUE INDEX "WalletTransaction_walletId_idempotencyKey_key" ON "WalletTransaction"("walletId", "idempotencyKey");
CREATE UNIQUE INDEX "WalletTransaction_walletId_type_referenceId_key" ON "WalletTransaction"("walletId", "type", "referenceId");
CREATE INDEX "Wallet_currency_idx" ON "Wallet"("currency");
CREATE INDEX "WalletTransaction_walletId_createdAt_idx" ON "WalletTransaction"("walletId", "createdAt");
CREATE INDEX "WalletTransaction_walletId_status_createdAt_idx" ON "WalletTransaction"("walletId", "status", "createdAt");
CREATE INDEX "WalletTransaction_referenceId_idx" ON "WalletTransaction"("referenceId");

ALTER TABLE "Wallet" ADD CONSTRAINT "Wallet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WalletTransaction" ADD CONSTRAINT "WalletTransaction_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WalletTransaction" ADD CONSTRAINT "WalletTransaction_refundOfTransactionId_fkey" FOREIGN KEY ("refundOfTransactionId") REFERENCES "WalletTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
