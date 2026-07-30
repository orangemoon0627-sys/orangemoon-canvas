CREATE TYPE "AssetKind" AS ENUM ('TEXT', 'IMAGE', 'VIDEO', 'AUDIO');

CREATE TABLE "Asset" (
    "id" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "AssetKind" NOT NULL,
    "title" TEXT NOT NULL,
    "coverUrl" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "source" TEXT,
    "note" TEXT,
    "data" JSONB NOT NULL,
    "metadata" JSONB,
    "generationJobId" TEXT,
    "ordinal" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Asset_publicId_key" ON "Asset"("publicId");
CREATE UNIQUE INDEX "Asset_generationJobId_ordinal_key" ON "Asset"("generationJobId", "ordinal");
CREATE INDEX "Asset_userId_createdAt_idx" ON "Asset"("userId", "createdAt");
CREATE INDEX "Asset_userId_kind_createdAt_idx" ON "Asset"("userId", "kind", "createdAt");
CREATE INDEX "Asset_generationJobId_idx" ON "Asset"("generationJobId");

ALTER TABLE "Asset" ADD CONSTRAINT "Asset_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_generationJobId_fkey" FOREIGN KEY ("generationJobId") REFERENCES "GenerationJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;
