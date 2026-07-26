/*
  Warnings:

  - Added the required column `sourceId` to the `MaterialCandidate` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "ExportJob" ADD COLUMN "stage" TEXT;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_MaterialCandidate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shotId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "previewUrl" TEXT NOT NULL,
    "downloadUrl" TEXT NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "durationMs" INTEGER,
    "attribution" TEXT,
    CONSTRAINT "MaterialCandidate_shotId_fkey" FOREIGN KEY ("shotId") REFERENCES "Shot" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_MaterialCandidate" ("attribution", "downloadUrl", "durationMs", "height", "id", "previewUrl", "provider", "shotId", "type", "width") SELECT "attribution", "downloadUrl", "durationMs", "height", "id", "previewUrl", "provider", "shotId", "type", "width" FROM "MaterialCandidate";
DROP TABLE "MaterialCandidate";
ALTER TABLE "new_MaterialCandidate" RENAME TO "MaterialCandidate";
CREATE INDEX "MaterialCandidate_shotId_idx" ON "MaterialCandidate"("shotId");
CREATE UNIQUE INDEX "MaterialCandidate_shotId_provider_sourceId_key" ON "MaterialCandidate"("shotId", "provider", "sourceId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
