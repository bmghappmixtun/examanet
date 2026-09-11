-- 2026-09-11: Add missing columns to fix teacher verification flow
-- 
-- The teacher verification flow (MR #52) was deployed without proper D1 schema
-- verification. The code references columns that don't exist:
-- - User.verificationFilesNote (for rejection reason)
-- - TeacherVerificationFile.fileName (file display name)
-- - TeacherVerificationFile.originalFormat (pdf/docx detection)
-- - TeacherVerificationFile.description, year (metadata from teacher)
-- - TeacherVerificationFile.uploadedAt (when teacher uploaded)
-- - TeacherVerificationFile.reviewedByAdmin (admin flag)
-- - TeacherVerificationFile.reviewNote (admin rejection reason)
-- - TeacherVerificationFile.teacherId (instead of relying on userId)
--
-- This migration adds all missing columns with safe defaults.

-- User table additions
ALTER TABLE User ADD COLUMN verificationFilesNote TEXT;

-- TeacherVerificationFile table additions
ALTER TABLE TeacherVerificationFile ADD COLUMN fileName TEXT;
ALTER TABLE TeacherVerificationFile ADD COLUMN originalFormat TEXT;
ALTER TABLE TeacherVerificationFile ADD COLUMN description TEXT;
ALTER TABLE TeacherVerificationFile ADD COLUMN year TEXT;
ALTER TABLE TeacherVerificationFile ADD COLUMN uploadedAt INTEGER;
ALTER TABLE TeacherVerificationFile ADD COLUMN reviewedByAdmin INTEGER DEFAULT 0;
ALTER TABLE TeacherVerificationFile ADD COLUMN reviewNote TEXT;
ALTER TABLE TeacherVerificationFile ADD COLUMN teacherId TEXT;

-- Backfill teacherId from userId for existing rows
UPDATE TeacherVerificationFile SET teacherId = userId WHERE teacherId IS NULL;
