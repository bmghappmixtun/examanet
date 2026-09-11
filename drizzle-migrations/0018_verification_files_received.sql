-- 2026-09-11: Add verificationFilesReceivedAt column to User table
-- This column tracks when a teacher first uploaded all 5 verification files.
-- It was being referenced in API code but never added to the D1 schema,
-- causing silent failures in /api/profile/update and /api/teacher/verification-files.
ALTER TABLE User ADD COLUMN verificationFilesReceivedAt INTEGER;
