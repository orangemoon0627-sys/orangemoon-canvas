-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('USER', 'ADMIN');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "LedgerTransactionType" AS ENUM ('RECHARGE', 'ADMIN_ADJUSTMENT', 'GENERATION_RESERVE', 'GENERATION_SETTLE', 'GENERATION_RELEASE');

-- CreateEnum
CREATE TYPE "RechargeStatus" AS ENUM ('PENDING', 'CONFIRMED', 'REJECTED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "PaymentProvider" AS ENUM ('ALIPAY_MANUAL', 'WECHAT_MANUAL');

-- CreateEnum
CREATE TYPE "GenerationStatus" AS ENUM ('RESERVED', 'SUBMITTED', 'SUCCEEDED', 'FAILED', 'RELEASED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ipHash" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Wallet" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "availableMilliCredits" BIGINT NOT NULL DEFAULT 0,
    "frozenMilliCredits" BIGINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Wallet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LedgerTransaction" (
    "id" TEXT NOT NULL,
    "type" "LedgerTransactionType" NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "userId" TEXT,
    "description" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LedgerTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LedgerEntry" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "walletId" TEXT,
    "account" TEXT NOT NULL,
    "amountMilli" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RechargeOrder" (
    "id" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" "PaymentProvider" NOT NULL,
    "status" "RechargeStatus" NOT NULL DEFAULT 'PENDING',
    "creditsMilli" BIGINT NOT NULL,
    "amountFen" INTEGER NOT NULL,
    "payerNote" TEXT,
    "externalReference" TEXT,
    "reviewNote" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RechargeOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentEvent" (
    "id" TEXT NOT NULL,
    "provider" "PaymentProvider" NOT NULL,
    "providerEventId" TEXT NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "payload" JSONB NOT NULL,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GenerationJob" (
    "id" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "capability" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "status" "GenerationStatus" NOT NULL DEFAULT 'RESERVED',
    "idempotencyKey" TEXT NOT NULL,
    "reservedMilliCredits" BIGINT NOT NULL,
    "chargedMilliCredits" BIGINT NOT NULL DEFAULT 0,
    "providerTaskId" TEXT,
    "providerState" TEXT,
    "error" TEXT,
    "requestSummary" JSONB,
    "priceSnapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "settledAt" TIMESTAMP(3),

    CONSTRAINT "GenerationJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceVersion" (
    "id" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "usdToCnyMicros" BIGINT NOT NULL,
    "markupBps" INTEGER NOT NULL,
    "rules" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PriceVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT,
    "details" JSONB,
    "ipHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_role_status_idx" ON "User"("role", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_expiresAt_idx" ON "Session"("userId", "expiresAt");

-- CreateIndex
CREATE INDEX "Session_expiresAt_revokedAt_idx" ON "Session"("expiresAt", "revokedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Wallet_userId_key" ON "Wallet"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "LedgerTransaction_idempotencyKey_key" ON "LedgerTransaction"("idempotencyKey");

-- CreateIndex
CREATE INDEX "LedgerTransaction_userId_createdAt_idx" ON "LedgerTransaction"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "LedgerTransaction_type_createdAt_idx" ON "LedgerTransaction"("type", "createdAt");

-- CreateIndex
CREATE INDEX "LedgerEntry_transactionId_idx" ON "LedgerEntry"("transactionId");

-- CreateIndex
CREATE INDEX "LedgerEntry_walletId_createdAt_idx" ON "LedgerEntry"("walletId", "createdAt");

-- CreateIndex
CREATE INDEX "LedgerEntry_account_createdAt_idx" ON "LedgerEntry"("account", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "RechargeOrder_publicId_key" ON "RechargeOrder"("publicId");

-- CreateIndex
CREATE INDEX "RechargeOrder_userId_createdAt_idx" ON "RechargeOrder"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "RechargeOrder_status_createdAt_idx" ON "RechargeOrder"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "RechargeOrder_provider_externalReference_key" ON "RechargeOrder"("provider", "externalReference");

-- CreateIndex
CREATE INDEX "PaymentEvent_processedAt_createdAt_idx" ON "PaymentEvent"("processedAt", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentEvent_provider_providerEventId_key" ON "PaymentEvent"("provider", "providerEventId");

-- CreateIndex
CREATE UNIQUE INDEX "GenerationJob_publicId_key" ON "GenerationJob"("publicId");

-- CreateIndex
CREATE UNIQUE INDEX "GenerationJob_providerTaskId_key" ON "GenerationJob"("providerTaskId");

-- CreateIndex
CREATE INDEX "GenerationJob_userId_createdAt_idx" ON "GenerationJob"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "GenerationJob_status_createdAt_idx" ON "GenerationJob"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "GenerationJob_userId_idempotencyKey_key" ON "GenerationJob"("userId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "PriceVersion_version_key" ON "PriceVersion"("version");

-- CreateIndex
CREATE INDEX "PriceVersion_active_createdAt_idx" ON "PriceVersion"("active", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_createdAt_idx" ON "AuditLog"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_targetType_targetId_createdAt_idx" ON "AuditLog"("targetType", "targetId", "createdAt");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Wallet" ADD CONSTRAINT "Wallet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerTransaction" ADD CONSTRAINT "LedgerTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "LedgerTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RechargeOrder" ADD CONSTRAINT "RechargeOrder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RechargeOrder" ADD CONSTRAINT "RechargeOrder_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GenerationJob" ADD CONSTRAINT "GenerationJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Financial invariants are enforced in PostgreSQL as well as in application code.
ALTER TABLE "Wallet" ADD CONSTRAINT "Wallet_non_negative_balances" CHECK ("availableMilliCredits" >= 0 AND "frozenMilliCredits" >= 0);
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_non_zero_amount" CHECK ("amountMilli" <> 0);
ALTER TABLE "RechargeOrder" ADD CONSTRAINT "RechargeOrder_positive_amounts" CHECK ("creditsMilli" > 0 AND "amountFen" > 0);
ALTER TABLE "GenerationJob" ADD CONSTRAINT "GenerationJob_valid_amounts" CHECK ("reservedMilliCredits" > 0 AND "chargedMilliCredits" >= 0);
CREATE UNIQUE INDEX "PriceVersion_one_active_key" ON "PriceVersion" (("active")) WHERE "active" = true;

CREATE OR REPLACE FUNCTION assert_ledger_transaction_balanced()
RETURNS TRIGGER AS $$
DECLARE
    target_transaction_id TEXT;
    entry_count BIGINT;
    entry_sum NUMERIC;
BEGIN
    IF TG_TABLE_NAME = 'LedgerTransaction' THEN
        target_transaction_id := COALESCE(NEW.id, OLD.id);
    ELSE
        target_transaction_id := COALESCE(NEW."transactionId", OLD."transactionId");
    END IF;

    SELECT COUNT(*), COALESCE(SUM("amountMilli"), 0)
      INTO entry_count, entry_sum
      FROM "LedgerEntry"
     WHERE "transactionId" = target_transaction_id;

    IF entry_count < 2 OR entry_sum <> 0 THEN
        RAISE EXCEPTION 'ledger transaction % is unbalanced (% entries, sum %)', target_transaction_id, entry_count, entry_sum
            USING ERRCODE = '23514';
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER "LedgerTransaction_balance_check"
AFTER INSERT OR UPDATE ON "LedgerTransaction"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION assert_ledger_transaction_balanced();

CREATE CONSTRAINT TRIGGER "LedgerEntry_balance_check"
AFTER INSERT OR UPDATE OR DELETE ON "LedgerEntry"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION assert_ledger_transaction_balanced();

CREATE OR REPLACE FUNCTION prevent_ledger_entry_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'ledger entries are immutable' USING ERRCODE = '55000';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "LedgerEntry_immutable"
BEFORE UPDATE OR DELETE ON "LedgerEntry"
FOR EACH ROW EXECUTE FUNCTION prevent_ledger_entry_mutation();
