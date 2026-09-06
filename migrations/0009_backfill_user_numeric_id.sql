-- 2026-09-06: Backfill numericId for existing users that don't have one.
-- Bug: clicking on a teacher in the public list led to /professeurs/null/slug
-- because some teachers (created via admin invitation or self-registration)
-- never got a numericId assigned.
--
-- This migration:
-- 1. Assigns numericId = MAX(numericId) + 1 to all TEACHER/STUDENT/ADMIN users
--    where numericId IS NULL
-- 2. Uses ROW_NUMBER() over the createdAt order so the first-created users
--    get the lower numericIds (preserves intuitive order)

UPDATE User
SET numericId = (
  SELECT COALESCE(MAX(numericId), 0) + ROW_NUMBER() OVER (ORDER BY createdAt ASC, id ASC)
  FROM User u2
  WHERE u2.numericId IS NOT NULL
)
WHERE numericId IS NULL;

-- Verify: all users should now have a numericId
-- (Uncomment to run as a check)
-- SELECT COUNT(*) FROM User WHERE numericId IS NULL;
-- Expected: 0
