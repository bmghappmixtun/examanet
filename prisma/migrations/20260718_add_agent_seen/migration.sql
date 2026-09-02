-- Add agentSeen tracking for Mavis notifications
ALTER TABLE "ErrorLog" ADD COLUMN "agentSeen" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ErrorLog" ADD COLUMN "agentSeenAt" TIMESTAMP(3);
CREATE INDEX "ErrorLog_agentSeen_createdAt_idx" ON "ErrorLog"("agentSeen", "createdAt");
