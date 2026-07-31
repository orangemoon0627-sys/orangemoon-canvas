-- CreateTable
CREATE TABLE "CanvasProject" (
    "id" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "clientCreatedAt" TIMESTAMP(3) NOT NULL,
    "clientUpdatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CanvasProject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CanvasMedia" (
    "id" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "bytes" BIGINT NOT NULL,
    "checksum" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CanvasMedia_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CanvasProject_userId_publicId_key" ON "CanvasProject"("userId", "publicId");

-- CreateIndex
CREATE INDEX "CanvasProject_userId_deletedAt_clientUpdatedAt_idx" ON "CanvasProject"("userId", "deletedAt", "clientUpdatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CanvasMedia_userId_storageKey_key" ON "CanvasMedia"("userId", "storageKey");

-- CreateIndex
CREATE INDEX "CanvasMedia_userId_updatedAt_idx" ON "CanvasMedia"("userId", "updatedAt");

-- AddForeignKey
ALTER TABLE "CanvasProject" ADD CONSTRAINT "CanvasProject_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CanvasMedia" ADD CONSTRAINT "CanvasMedia_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
