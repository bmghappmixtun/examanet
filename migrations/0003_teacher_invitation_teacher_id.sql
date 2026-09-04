-- ==========================================
-- TeacherInvitation.teacherId column
-- ==========================================
-- Original Prisma schema had teacherId as required FK to User.
-- The D1 initial migration missed this column. The admin invitations
-- page does `include: { teacher: ... }` which requires the FK.
-- 
-- Backfill from existing data: all 17 EXISTING invitations have
-- a matching User by email (verified 2026-09-04).

ALTER TABLE TeacherInvitation ADD COLUMN teacherId TEXT REFERENCES "User"(id) ON DELETE CASCADE;

-- Backfill: link each existing invitation to its matching User by email
UPDATE TeacherInvitation
SET teacherId = (SELECT id FROM "User" WHERE email = TeacherInvitation.email)
WHERE teacherId IS NULL;

-- Verify
-- SELECT COUNT(*) as total, COUNT(teacherId) as with_teacher FROM TeacherInvitation;
-- Expected: 17 total, 17 with_teacher
