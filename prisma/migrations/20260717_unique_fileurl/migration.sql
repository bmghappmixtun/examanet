-- DATA INTEGRITY: prevent duplicate file uploads
-- fileUrl is 100% unique in the current data (15,336 rows, 15,336 distinct).
-- Adding UNIQUE constraint to prevent the same blob from being imported twice.
--
-- If a duplicate is ever found, this migration will fail. The fix is to dedup first
-- (see scripts/one-off/dedup-resources-by-fileurl.mjs for the dedup script).

-- First, check no duplicates exist
DO $$
DECLARE
  dup_count INT;
BEGIN
  SELECT COUNT(*) INTO dup_count FROM (
    SELECT "fileUrl", COUNT(*) c
    FROM "Resource"
    GROUP BY "fileUrl"
    HAVING COUNT(*) > 1
  ) t;
  
  IF dup_count > 0 THEN
    RAISE EXCEPTION 'Found % duplicate fileUrls. Run dedup first.', dup_count;
  END IF;
END $$;

-- Add the unique constraint
ALTER TABLE "Resource"
  ADD CONSTRAINT "Resource_fileUrl_key" UNIQUE ("fileUrl");
