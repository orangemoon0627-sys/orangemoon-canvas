CREATE TYPE "WorkspaceKind" AS ENUM ('PERSONAL', 'TEAM');
CREATE TYPE "WorkspaceRole" AS ENUM ('OWNER', 'ADMIN', 'EDITOR', 'VIEWER');
ALTER TYPE "AssetKind" ADD VALUE 'MODEL';

CREATE TABLE "Workspace" (
    "id" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "WorkspaceKind" NOT NULL DEFAULT 'TEAM',
    "createdById" TEXT NOT NULL,
    "personalForUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WorkspaceMember" (
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "WorkspaceRole" NOT NULL DEFAULT 'EDITOR',
    "invitedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WorkspaceMember_pkey" PRIMARY KEY ("workspaceId", "userId")
);

CREATE TABLE "WorkspaceInvite" (
    "id" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "WorkspaceRole" NOT NULL DEFAULT 'EDITOR',
    "createdById" TEXT NOT NULL,
    "acceptedById" TEXT,
    "acceptedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WorkspaceInvite_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CollaborationDocument" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "documentKey" TEXT NOT NULL,
    "state" BYTEA NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CollaborationDocument_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "GenerationJob" ADD COLUMN "workspaceId" TEXT;
ALTER TABLE "Asset" ADD COLUMN "workspaceId" TEXT;
ALTER TABLE "CanvasProject" ADD COLUMN "workspaceId" TEXT;
ALTER TABLE "CanvasMedia" ADD COLUMN "workspaceId" TEXT;
ALTER TABLE "AgentThread" ADD COLUMN "workspaceId" TEXT;
ALTER TABLE "AgentTurn" ADD COLUMN "workspaceId" TEXT;

INSERT INTO "Workspace" ("id", "publicId", "name", "kind", "createdById", "personalForUserId", "createdAt", "updatedAt")
SELECT 'ws_' || "id", 'personal_' || "id", COALESCE(NULLIF("displayName", ''), split_part("email", '@', 1)) || '的个人空间', 'PERSONAL', "id", "id", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "User";

INSERT INTO "WorkspaceMember" ("workspaceId", "userId", "role", "createdAt", "updatedAt")
SELECT 'ws_' || "id", "id", 'OWNER', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP FROM "User";

UPDATE "GenerationJob" SET "workspaceId" = 'ws_' || "userId" WHERE "workspaceId" IS NULL;
UPDATE "Asset" SET "workspaceId" = 'ws_' || "userId" WHERE "workspaceId" IS NULL;
UPDATE "CanvasProject" SET "workspaceId" = 'ws_' || "userId" WHERE "workspaceId" IS NULL;
UPDATE "CanvasMedia" SET "workspaceId" = 'ws_' || "userId" WHERE "workspaceId" IS NULL;
UPDATE "AgentThread" SET "workspaceId" = 'ws_' || "userId" WHERE "workspaceId" IS NULL;
UPDATE "AgentTurn" SET "workspaceId" = 'ws_' || "userId" WHERE "workspaceId" IS NULL;

ALTER TABLE "GenerationJob" ALTER COLUMN "workspaceId" SET NOT NULL;
ALTER TABLE "Asset" ALTER COLUMN "workspaceId" SET NOT NULL;
ALTER TABLE "CanvasProject" ALTER COLUMN "workspaceId" SET NOT NULL;
ALTER TABLE "CanvasMedia" ALTER COLUMN "workspaceId" SET NOT NULL;
ALTER TABLE "AgentThread" ALTER COLUMN "workspaceId" SET NOT NULL;
ALTER TABLE "AgentTurn" ALTER COLUMN "workspaceId" SET NOT NULL;

DROP INDEX "CanvasProject_userId_publicId_key";
DROP INDEX "CanvasMedia_userId_storageKey_key";

CREATE UNIQUE INDEX "Workspace_publicId_key" ON "Workspace"("publicId");
CREATE UNIQUE INDEX "Workspace_personalForUserId_key" ON "Workspace"("personalForUserId");
CREATE INDEX "Workspace_createdById_createdAt_idx" ON "Workspace"("createdById", "createdAt");
CREATE INDEX "Workspace_kind_createdAt_idx" ON "Workspace"("kind", "createdAt");
CREATE INDEX "WorkspaceMember_userId_createdAt_idx" ON "WorkspaceMember"("userId", "createdAt");
CREATE INDEX "WorkspaceMember_workspaceId_role_idx" ON "WorkspaceMember"("workspaceId", "role");
CREATE UNIQUE INDEX "WorkspaceInvite_publicId_key" ON "WorkspaceInvite"("publicId");
CREATE UNIQUE INDEX "WorkspaceInvite_tokenHash_key" ON "WorkspaceInvite"("tokenHash");
CREATE INDEX "WorkspaceInvite_workspaceId_createdAt_idx" ON "WorkspaceInvite"("workspaceId", "createdAt");
CREATE INDEX "WorkspaceInvite_email_expiresAt_idx" ON "WorkspaceInvite"("email", "expiresAt");
CREATE UNIQUE INDEX "CollaborationDocument_workspaceId_documentKey_key" ON "CollaborationDocument"("workspaceId", "documentKey");
CREATE INDEX "CollaborationDocument_workspaceId_updatedAt_idx" ON "CollaborationDocument"("workspaceId", "updatedAt");
CREATE INDEX "GenerationJob_workspaceId_createdAt_idx" ON "GenerationJob"("workspaceId", "createdAt");
CREATE INDEX "Asset_workspaceId_createdAt_idx" ON "Asset"("workspaceId", "createdAt");
CREATE INDEX "Asset_workspaceId_kind_createdAt_idx" ON "Asset"("workspaceId", "kind", "createdAt");
CREATE UNIQUE INDEX "CanvasProject_workspaceId_publicId_key" ON "CanvasProject"("workspaceId", "publicId");
CREATE INDEX "CanvasProject_workspaceId_deletedAt_clientUpdatedAt_idx" ON "CanvasProject"("workspaceId", "deletedAt", "clientUpdatedAt");
CREATE UNIQUE INDEX "CanvasMedia_workspaceId_storageKey_key" ON "CanvasMedia"("workspaceId", "storageKey");
CREATE INDEX "CanvasMedia_workspaceId_updatedAt_idx" ON "CanvasMedia"("workspaceId", "updatedAt");
CREATE INDEX "AgentThread_workspaceId_projectId_updatedAt_idx" ON "AgentThread"("workspaceId", "projectId", "updatedAt");
CREATE INDEX "AgentThread_workspaceId_projectId_lastOpenedAt_idx" ON "AgentThread"("workspaceId", "projectId", "lastOpenedAt");
CREATE INDEX "AgentTurn_workspaceId_projectId_createdAt_idx" ON "AgentTurn"("workspaceId", "projectId", "createdAt");

ALTER TABLE "Workspace" ADD CONSTRAINT "Workspace_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Workspace" ADD CONSTRAINT "Workspace_personalForUserId_fkey" FOREIGN KEY ("personalForUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkspaceMember" ADD CONSTRAINT "WorkspaceMember_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkspaceMember" ADD CONSTRAINT "WorkspaceMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkspaceMember" ADD CONSTRAINT "WorkspaceMember_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WorkspaceInvite" ADD CONSTRAINT "WorkspaceInvite_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkspaceInvite" ADD CONSTRAINT "WorkspaceInvite_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WorkspaceInvite" ADD CONSTRAINT "WorkspaceInvite_acceptedById_fkey" FOREIGN KEY ("acceptedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CollaborationDocument" ADD CONSTRAINT "CollaborationDocument_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GenerationJob" ADD CONSTRAINT "GenerationJob_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CanvasProject" ADD CONSTRAINT "CanvasProject_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CanvasMedia" ADD CONSTRAINT "CanvasMedia_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentThread" ADD CONSTRAINT "AgentThread_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentTurn" ADD CONSTRAINT "AgentTurn_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
