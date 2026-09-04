-- ==========================================
-- Invitation tracking columns (missing in D1)
-- ==========================================
-- The invitation flow code references several columns that were missing
-- in the initial D1 migration. Without them, db.teacherInvitation.update
-- and db.user.update fail silently, breaking the entire flow:
--   - activation (status -> ACTIVATED)
--   - click recording (linkClickedAt, clickCount)
--   - cancellation (cancelledAt)
-- 
-- These columns existed in the original Prisma schema for TeacherInvitation
-- and User. Add them now to restore full functionality.

-- TeacherInvitation: tracking timestamps
ALTER TABLE TeacherInvitation ADD COLUMN activatedAt INTEGER;
ALTER TABLE TeacherInvitation ADD COLUMN linkClickedAt INTEGER;
ALTER TABLE TeacherInvitation ADD COLUMN clickUserAgent TEXT;
ALTER TABLE TeacherInvitation ADD COLUMN cancelledAt INTEGER;
ALTER TABLE TeacherInvitation ADD COLUMN openedAt INTEGER;
ALTER TABLE TeacherInvitation ADD COLUMN openCount INTEGER DEFAULT 0;
ALTER TABLE TeacherInvitation ADD COLUMN deliveryDetail TEXT;

-- User: invitation lifecycle
ALTER TABLE "User" ADD COLUMN invitationActivatedAt INTEGER;

-- Backfill: ACTIVATED invitations should have activatedAt = acceptedAt
UPDATE TeacherInvitation
SET activatedAt = acceptedAt
WHERE status = 'ACTIVATED' AND activatedAt IS NULL AND acceptedAt IS NOT NULL;
