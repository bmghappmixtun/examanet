-- ==========================================
-- Resource approval workflow columns
-- ==========================================
-- The admin approval workflow (/api/admin/resource/[id]/[action] and
-- /api/admin/resource/[id]/edit) uses several columns that were missing
-- in the initial D1 migration. Without them, all update operations
-- fail silently (d1-admin.update returns null without error):
--   - editRejectionReason: shown to teacher when edit is rejected
--   - editSummary: optional summary of what was edited
--   - approvedById/approvedAt: who approved and when
--   - originalFileKey/originalFileName: keep the Word doc alongside PDF
-- 
-- This migration adds all 6 columns (idempotent).

ALTER TABLE Resource ADD COLUMN editRejectionReason TEXT;
ALTER TABLE Resource ADD COLUMN editSummary TEXT;
ALTER TABLE Resource ADD COLUMN approvedById TEXT;
ALTER TABLE Resource ADD COLUMN approvedAt INTEGER;
ALTER TABLE Resource ADD COLUMN originalFileKey TEXT;
ALTER TABLE Resource ADD COLUMN originalFileName TEXT;
