-- 2026-09-05: Add columns to VercelLog for Cloudflare Observability sync
-- VercelLog was originally for Vercel Log Drain. Now we use it for CF Workers
-- Observability events (since the schema is generic enough).
--
-- New columns:
-- - level: 'error' | 'warning' | 'info' (from CF event level)
-- - message: the actual log content (from CF event source.message or source.error)
-- - externalId: CF event hash for dedup (sha256 of timestamp+requestId+message)
-- - source: 'cloudflare' | 'vercel' (which platform produced the log)

ALTER TABLE VercelLog ADD COLUMN level TEXT;
ALTER TABLE VercelLog ADD COLUMN message TEXT;
ALTER TABLE VercelLog ADD COLUMN externalId TEXT;
ALTER TABLE VercelLog ADD COLUMN source TEXT DEFAULT 'cloudflare';

-- Unique index for dedup (allows re-running the cron without duplicates)
CREATE UNIQUE INDEX IF NOT EXISTS idx_vercellog_externalId ON VercelLog(externalId) WHERE externalId IS NOT NULL;

-- Index for filtering by level + date
CREATE INDEX IF NOT EXISTS idx_vercellog_level_date ON VercelLog(level, createdAt);
