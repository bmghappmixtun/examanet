-- ResourceContent: raw text extracted from PDF
CREATE TABLE IF NOT EXISTS "ResourceContent" (
  "id" TEXT PRIMARY KEY,
  "resourceId" TEXT NOT NULL UNIQUE,
  "fullText" TEXT,
  "pageCount" INTEGER,
  "wordCount" INTEGER,
  "extractionMethod" TEXT,
  "extractionDurationMs" INTEGER,
  "extractionError" TEXT,
  "extractedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "modelUsed" TEXT
);

CREATE INDEX IF NOT EXISTS "ResourceContent_resourceId_idx" ON "ResourceContent" ("resourceId");

-- ResourceMetadata: structured metadata from AI
CREATE TABLE IF NOT EXISTS "ResourceMetadata" (
  "id" TEXT PRIMARY KEY,
  "resourceId" TEXT NOT NULL UNIQUE,
  "profNames" TEXT[],
  "schoolName" TEXT,
  "year" TEXT,
  "type" TEXT,
  "subtype" TEXT,
  "subject" TEXT,
  "dossierTechnique" TEXT,
  "systemName" TEXT,
  "duration" TEXT,
  "level" TEXT,
  "keyPoints" TEXT[],
  "topics" TEXT[],
  "difficulty" TEXT,
  "estimatedTimeMinutes" INTEGER,
  "prerequisites" TEXT[],
  "keyInsights" TEXT[],
  "extractedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "modelUsed" TEXT
);

CREATE INDEX IF NOT EXISTS "ResourceMetadata_resourceId_idx" ON "ResourceMetadata" ("resourceId");
CREATE INDEX IF NOT EXISTS "ResourceMetadata_systemName_idx" ON "ResourceMetadata" ("systemName");
CREATE INDEX IF NOT EXISTS "ResourceMetadata_dossierTechnique_idx" ON "ResourceMetadata" ("dossierTechnique");
CREATE INDEX IF NOT EXISTS "ResourceMetadata_topics_gin_idx" ON "ResourceMetadata" USING GIN ("topics");

-- ResourceSummary: AI-generated summary
CREATE TABLE IF NOT EXISTS "ResourceSummary" (
  "id" TEXT PRIMARY KEY,
  "resourceId" TEXT NOT NULL UNIQUE,
  "summary" TEXT NOT NULL,
  "extractedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "modelUsed" TEXT
);

CREATE INDEX IF NOT EXISTS "ResourceSummary_resourceId_idx" ON "ResourceSummary" ("resourceId");
