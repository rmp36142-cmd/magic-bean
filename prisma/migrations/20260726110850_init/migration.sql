-- CreateTable
CREATE TABLE "Settings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "llmBaseUrl" TEXT,
    "llmApiKey" TEXT,
    "llmModel" TEXT,
    "pexelsApiKey" TEXT,
    "pixabayApiKey" TEXT,
    "ttsProvider" TEXT NOT NULL DEFAULT 'edge-tts',
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "script" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Shot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "description" TEXT,
    "keywordsZh" TEXT,
    "keywordsEn" TEXT,
    "materialProvider" TEXT,
    "materialType" TEXT,
    "materialUrl" TEXT,
    "materialThumbUrl" TEXT,
    "durationMs" INTEGER,
    CONSTRAINT "Shot_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MaterialCandidate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shotId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "previewUrl" TEXT NOT NULL,
    "downloadUrl" TEXT NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "durationMs" INTEGER,
    "attribution" TEXT,
    CONSTRAINT "MaterialCandidate_shotId_fkey" FOREIGN KEY ("shotId") REFERENCES "Shot" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AudioSegment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shotId" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'edge-tts',
    CONSTRAINT "AudioSegment_shotId_fkey" FOREIGN KEY ("shotId") REFERENCES "Shot" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SubtitleSegment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shotId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "startMs" INTEGER NOT NULL,
    "endMs" INTEGER NOT NULL,
    CONSTRAINT "SubtitleSegment_shotId_fkey" FOREIGN KEY ("shotId") REFERENCES "Shot" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ExportJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "outputPath" TEXT,
    "errorMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ExportJob_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Shot_projectId_idx" ON "Shot"("projectId");

-- CreateIndex
CREATE INDEX "MaterialCandidate_shotId_idx" ON "MaterialCandidate"("shotId");

-- CreateIndex
CREATE UNIQUE INDEX "AudioSegment_shotId_key" ON "AudioSegment"("shotId");

-- CreateIndex
CREATE INDEX "SubtitleSegment_shotId_idx" ON "SubtitleSegment"("shotId");

-- CreateIndex
CREATE INDEX "ExportJob_projectId_idx" ON "ExportJob"("projectId");
