-- 2026-09-11: Add verifiedAt column to User table for teacher verification flow
ALTER TABLE User ADD COLUMN verifiedAt INTEGER;
