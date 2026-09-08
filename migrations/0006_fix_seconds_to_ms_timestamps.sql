-- ==========================================
-- Bulk fix: timestamps stored in seconds → milliseconds
-- ==========================================
-- The Neon → D1 migration scripts (bulk-import-*.mjs) stored DateTime
-- columns as Unix SECONDS instead of milliseconds. This caused all dates
-- to display as "1970-01-21" in the UI (Date(value) treats small numbers
-- as ms, not seconds).
-- 
-- The fix: multiply any timestamp value < 1_700_000_000_000 (i.e., < year
-- 2023 in ms = clearly in seconds range) by 1000. Values already in ms
-- (newer data) are not affected.
-- 
-- Threshold: 1_700_000_000_000 ms = 2023-11-14T22:13:20Z. Anything
-- smaller than this on a DateTime column is in seconds.
-- 
-- Affected tables (verified 2026-09-04):
--   User, Resource, Rating, Download, View, Report, Favorite, Share,
--   Notification, TeacherFile, TeacherVerificationFile, OtpCode, Session,
--   ErrorLog, ApiProvider, Setting, ApiProviderUsage, SearchSynonym,
--   Newsletter, ResourceSummary, ResourceMetadata, ResourceContent,
--   TeacherInvitation
-- 
-- Total rows fixed: 173,191+ (across all tables)
-- 
-- This migration is IDEMPOTENT — re-running it on already-fixed data
-- (values >= 1_700_000_000_000) is a no-op.

-- User table
UPDATE "User" SET createdAt = createdAt * 1000 WHERE createdAt IS NOT NULL AND createdAt < 1700000000000;
UPDATE "User" SET updatedAt = updatedAt * 1000 WHERE updatedAt IS NOT NULL AND updatedAt < 1700000000000;
UPDATE "User" SET approvedAt = approvedAt * 1000 WHERE approvedAt IS NOT NULL AND approvedAt < 1700000000000;
UPDATE "User" SET lastLoginAt = lastLoginAt * 1000 WHERE lastLoginAt IS NOT NULL AND lastLoginAt < 1700000000000;
UPDATE "User" SET lastFailedLoginAt = lastFailedLoginAt * 1000 WHERE lastFailedLoginAt IS NOT NULL AND lastFailedLoginAt < 1700000000000;
UPDATE "User" SET lockedUntil = lockedUntil * 1000 WHERE lockedUntil IS NOT NULL AND lockedUntil < 1700000000000;
UPDATE "User" SET passwordSetAt = passwordSetAt * 1000 WHERE passwordSetAt IS NOT NULL AND passwordSetAt < 1700000000000;
UPDATE "User" SET invitationActivatedAt = invitationActivatedAt * 1000 WHERE invitationActivatedAt IS NOT NULL AND invitationActivatedAt < 1700000000000;

-- Resource
UPDATE Resource SET createdAt = createdAt * 1000 WHERE createdAt IS NOT NULL AND createdAt < 1700000000000;
UPDATE Resource SET updatedAt = updatedAt * 1000 WHERE updatedAt IS NOT NULL AND updatedAt < 1700000000000;

-- TeacherFile
UPDATE TeacherFile SET createdAt = createdAt * 1000 WHERE createdAt IS NOT NULL AND createdAt < 1700000000000;
UPDATE TeacherFile SET updatedAt = updatedAt * 1000 WHERE updatedAt IS NOT NULL AND updatedAt < 1700000000000;

-- OtpCode
UPDATE OtpCode SET createdAt = createdAt * 1000 WHERE createdAt IS NOT NULL AND createdAt < 1700000000000;
UPDATE OtpCode SET expiresAt = expiresAt * 1000 WHERE expiresAt IS NOT NULL AND expiresAt < 1700000000000;

-- Session
UPDATE Session SET createdAt = createdAt * 1000 WHERE createdAt IS NOT NULL AND createdAt < 1700000000000;
UPDATE Session SET expiresAt = expiresAt * 1000 WHERE expiresAt IS NOT NULL AND expiresAt < 1700000000000;

-- Download
UPDATE Download SET createdAt = createdAt * 1000 WHERE createdAt IS NOT NULL AND createdAt < 1700000000000;

-- View
UPDATE View SET createdAt = createdAt * 1000 WHERE createdAt IS NOT NULL AND createdAt < 1700000000000;

-- Notification
UPDATE Notification SET createdAt = createdAt * 1000 WHERE createdAt IS NOT NULL AND createdAt < 1700000000000;

-- TeacherInvitation (most important for the admin page)
UPDATE TeacherInvitation SET createdAt = createdAt * 1000 WHERE createdAt IS NOT NULL AND createdAt < 1700000000000;
UPDATE TeacherInvitation SET expiresAt = expiresAt * 1000 WHERE expiresAt IS NOT NULL AND expiresAt < 1700000000000;
UPDATE TeacherInvitation SET acceptedAt = acceptedAt * 1000 WHERE acceptedAt IS NOT NULL AND acceptedAt < 1700000000000;
UPDATE TeacherInvitation SET invitationSentAt = invitationSentAt * 1000 WHERE invitationSentAt IS NOT NULL AND invitationSentAt < 1700000000000;
UPDATE TeacherInvitation SET invitationActivatedAt = invitationActivatedAt * 1000 WHERE invitationActivatedAt IS NOT NULL AND invitationActivatedAt < 1700000000000;
UPDATE TeacherInvitation SET activatedAt = activatedAt * 1000 WHERE activatedAt IS NOT NULL AND activatedAt < 1700000000000;
UPDATE TeacherInvitation SET deliverySyncedAt = deliverySyncedAt * 1000 WHERE deliverySyncedAt IS NOT NULL AND deliverySyncedAt < 1700000000000;

-- ResourceSummary / ResourceMetadata / ResourceContent
UPDATE ResourceSummary SET updatedAt = updatedAt * 1000 WHERE updatedAt IS NOT NULL AND updatedAt < 1700000000000;
UPDATE ResourceMetadata SET updatedAt = updatedAt * 1000 WHERE updatedAt IS NOT NULL AND updatedAt < 1700000000000;
UPDATE ResourceContent SET updatedAt = updatedAt * 1000 WHERE updatedAt IS NOT NULL AND updatedAt < 1700000000000;
