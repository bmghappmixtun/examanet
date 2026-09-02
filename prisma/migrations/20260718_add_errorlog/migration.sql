-- CreateErrorLog
CREATE TYPE "ErrorSource" AS ENUM ('CLIENT', 'SERVER', 'BUILD', 'CRON', 'EXTERNAL');
CREATE TYPE "ErrorSeverity" AS ENUM ('DEBUG', 'INFO', 'WARNING', 'ERROR', 'CRITICAL');

CREATE TABLE "ErrorLog" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "source" "ErrorSource" NOT NULL,
    "severity" "ErrorSeverity" NOT NULL DEFAULT 'ERROR',
    "message" TEXT NOT NULL,
    "stack" TEXT,
    "url" TEXT,
    "method" TEXT,
    "userAgent" TEXT,
    "userId" TEXT,
    "userEmail" TEXT,
    "region" TEXT,
    "requestId" TEXT,
    "context" JSONB,
    "emailSent" BOOLEAN NOT NULL DEFAULT false,
    "emailedAt" TIMESTAMP(3),
    "agentNotified" BOOLEAN NOT NULL DEFAULT false,
    "agentNotifiedAt" TIMESTAMP(3),
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ErrorLog_pkey" PRIMARY KEY ("id")
);

-- UniqueIndex on reference
CREATE UNIQUE INDEX "ErrorLog_reference_key" ON "ErrorLog"("reference");

-- Performance indexes
CREATE INDEX "ErrorLog_source_createdAt_idx" ON "ErrorLog"("source", "createdAt");
CREATE INDEX "ErrorLog_severity_createdAt_idx" ON "ErrorLog"("severity", "createdAt");
CREATE INDEX "ErrorLog_resolved_createdAt_idx" ON "ErrorLog"("resolved", "createdAt");
CREATE INDEX "ErrorLog_userId_createdAt_idx" ON "ErrorLog"("userId", "createdAt");
