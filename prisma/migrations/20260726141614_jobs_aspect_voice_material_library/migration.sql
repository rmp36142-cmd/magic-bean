/*
  Warnings:

  - You are about to drop the `ExportJob` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropIndex
DROP INDEX "ExportJob_projectId_idx";

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "ExportJob";
PRAGMA foreign_keys=on;

-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "stage" TEXT,
    "outputPath" TEXT,
    "errorMessage" TEXT,
    "heartbeatAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Job_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FavoriteMaterial" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "provider" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "previewUrl" TEXT NOT NULL,
    "downloadUrl" TEXT NOT NULL,
    "attribution" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "UserMaterial" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "thumbPath" TEXT,
    "originalName" TEXT NOT NULL,
    "durationMs" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Project" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "script" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "backgroundMusicPath" TEXT,
    "transitionsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "aspectRatio" TEXT NOT NULL DEFAULT '16:9',
    "voice" TEXT NOT NULL DEFAULT 'zh-CN-XiaoxiaoNeural'
);
INSERT INTO "new_Project" ("backgroundMusicPath", "createdAt", "id", "script", "status", "title", "transitionsEnabled", "updatedAt") SELECT "backgroundMusicPath", "createdAt", "id", "script", "status", "title", "transitionsEnabled", "updatedAt" FROM "Project";
DROP TABLE "Project";
ALTER TABLE "new_Project" RENAME TO "Project";
CREATE TABLE "new_SubtitleSegment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shotId" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "text" TEXT NOT NULL,
    "startMs" INTEGER NOT NULL,
    "endMs" INTEGER NOT NULL,
    CONSTRAINT "SubtitleSegment_shotId_fkey" FOREIGN KEY ("shotId") REFERENCES "Shot" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_SubtitleSegment" ("endMs", "id", "shotId", "startMs", "text") SELECT "endMs", "id", "shotId", "startMs", "text" FROM "SubtitleSegment";
DROP TABLE "SubtitleSegment";
ALTER TABLE "new_SubtitleSegment" RENAME TO "SubtitleSegment";
CREATE INDEX "SubtitleSegment_shotId_idx" ON "SubtitleSegment"("shotId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "Job_projectId_kind_idx" ON "Job"("projectId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "FavoriteMaterial_provider_sourceId_key" ON "FavoriteMaterial"("provider", "sourceId");
