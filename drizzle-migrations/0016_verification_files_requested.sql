-- 2026-09-10: Add missing verificationFilesRequestedAt column to User
-- Used by /api/admin/teacher/[id]/request-files and admin/approbations page
ALTER TABLE User ADD COLUMN verificationFilesRequestedAt INTEGER;
