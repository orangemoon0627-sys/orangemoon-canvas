CREATE TABLE "AgentThread" (
    "id" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "preview" TEXT NOT NULL DEFAULT '',
    "name" TEXT,
    "messages" JSONB NOT NULL DEFAULT '[]',
    "history" JSONB NOT NULL DEFAULT '[]',
    "lastOpenedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentThread_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AgentThread_publicId_key" ON "AgentThread"("publicId");
CREATE INDEX "AgentThread_userId_projectId_updatedAt_idx" ON "AgentThread"("userId", "projectId", "updatedAt");
CREATE INDEX "AgentThread_userId_projectId_lastOpenedAt_idx" ON "AgentThread"("userId", "projectId", "lastOpenedAt");

ALTER TABLE "AgentThread" ADD CONSTRAINT "AgentThread_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
