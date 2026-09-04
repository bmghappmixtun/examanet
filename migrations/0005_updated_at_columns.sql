-- ==========================================
-- updatedAt columns (missing in D1)
-- ==========================================
-- d1-admin.update() always adds `updatedAt = ?` to the UPDATE statement
-- (see src/lib/d1-admin.ts). If the table doesn't have an updatedAt
-- column, the UPDATE fails with "no such column: updatedAt" and the row
-- is NOT updated — silently.
-- 
-- This is the root cause of:
--   - invitation activation (status never becomes ACTIVATED)
--   - click recording (clickCount never increments)
--   - cancel (status never becomes CANCELLED)
--   - and many other update operations
-- 
-- 2026-09-04: Apply only the columns that DON'T already exist (Resource,
-- Comment, TeacherFile, ApiProvider already had updatedAt from prior migrations).

ALTER TABLE TeacherInvitation ADD COLUMN updatedAt INTEGER;
ALTER TABLE Session ADD COLUMN updatedAt INTEGER;
ALTER TABLE TeacherVerificationFile ADD COLUMN updatedAt INTEGER;
ALTER TABLE OtpCode ADD COLUMN updatedAt INTEGER;
ALTER TABLE ErrorLog ADD COLUMN updatedAt INTEGER;
