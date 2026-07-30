ALTER TYPE "LedgerTransactionType" ADD VALUE 'AGENT_RESERVE';
ALTER TYPE "LedgerTransactionType" ADD VALUE 'AGENT_SETTLE';
ALTER TYPE "LedgerTransactionType" ADD VALUE 'AGENT_RELEASE';

CREATE TYPE "AgentTurnStatus" AS ENUM ('RESERVED', 'SUCCEEDED', 'FAILED');

CREATE TABLE "AgentTurn" (
    "id" TEXT NOT NULL,
    "turnId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "status" "AgentTurnStatus" NOT NULL DEFAULT 'RESERVED',
    "reservedMilliCredits" BIGINT NOT NULL,
    "chargedMilliCredits" BIGINT NOT NULL DEFAULT 0,
    "inputTokens" BIGINT NOT NULL DEFAULT 0,
    "cachedInputTokens" BIGINT NOT NULL DEFAULT 0,
    "outputTokens" BIGINT NOT NULL DEFAULT 0,
    "totalTokens" BIGINT NOT NULL DEFAULT 0,
    "priceSnapshot" JSONB NOT NULL,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "settledAt" TIMESTAMP(3),

    CONSTRAINT "AgentTurn_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AgentTurn_turnId_key" ON "AgentTurn"("turnId");
CREATE INDEX "AgentTurn_userId_createdAt_idx" ON "AgentTurn"("userId", "createdAt");
CREATE INDEX "AgentTurn_status_createdAt_idx" ON "AgentTurn"("status", "createdAt");
CREATE INDEX "AgentTurn_userId_projectId_createdAt_idx" ON "AgentTurn"("userId", "projectId", "createdAt");

ALTER TABLE "AgentTurn" ADD CONSTRAINT "AgentTurn_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
