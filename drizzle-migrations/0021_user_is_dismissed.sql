-- 2026-09-12: Add isDismissed flag to User
-- Allows admin to "empty" the approbations/verifications pages without hard delete
-- Used by "Vider la page" UI button on /admin/approbations and /admin/verifications
ALTER TABLE User ADD COLUMN isDismissed INTEGER NOT NULL DEFAULT 0;
