-- 2026-09-14: Add lastLoginAt column to User table for admin tracking
-- The auth code already tries to UPDATE lastLoginAt but the column doesn't exist in D1,
-- causing silent failures and an empty "Dernier login" column in /admin/utilisateurs.

ALTER TABLE User ADD COLUMN lastLoginAt INTEGER;
--> statement-breakpoint

-- Backfill from latest Session per user (best estimate for existing users)
UPDATE User
SET lastLoginAt = (
  SELECT MAX(s.createdAt)
  FROM Session s
  WHERE s.userId = User.id
)
WHERE lastLoginAt IS NULL;
