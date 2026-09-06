-- 2026-09-06: Rename VercelLog → CloudflareLog.
-- The table was originally created when the project was on Vercel (with
-- a Vercel Log Drain that pushed worker events to D1). We migrated to
-- Cloudflare Workers + R2 in 2026-08 and replaced the Log Drain with a
-- CF Observability sync cron (see src/app/api/cron/cf-observability-sync),
-- but kept the misleading table name. Renaming now for clarity.
ALTER TABLE VercelLog RENAME TO CloudflareLog;
