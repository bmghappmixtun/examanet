-- 2026-09-06: Add seenBySession column to ErrorLog + CloudflareLog.
-- Used by /api/agent/session-start to track which errors Mavis has
-- already seen in a session, so it doesn't re-process the same digest
-- on every Mavis session start.
ALTER TABLE ErrorLog ADD COLUMN seenBySession INTEGER DEFAULT 0;
ALTER TABLE CloudflareLog ADD COLUMN seenBySession INTEGER DEFAULT 0;
