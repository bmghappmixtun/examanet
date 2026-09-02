-- ============================================================================
-- Full-text search setup for Resource table
-- Idempotent: safe to run multiple times
-- ============================================================================

-- 1. Ensure the search_vector column exists
ALTER TABLE "Resource" ADD COLUMN IF NOT EXISTS search_vector tsvector;

-- 2. Create GIN index for fast full-text search
CREATE INDEX IF NOT EXISTS "Resource_search_vector_idx" ON "Resource" USING GIN (search_vector);

-- 3. Recreate the trigger function
CREATE OR REPLACE FUNCTION update_resource_search_vector()
RETURNS trigger AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('french', COALESCE(NEW.title, '')), 'A') ||
    setweight(to_tsvector('french', COALESCE(NEW.description, '')), 'B') ||
    setweight(to_tsvector('arabic', COALESCE(NEW.title, '')), 'A') ||
    setweight(to_tsvector('arabic', COALESCE(NEW.description, '')), 'B') ||
    setweight(to_tsvector('simple', COALESCE(NEW.tags, '')), 'C');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4. Recreate the trigger
DROP TRIGGER IF EXISTS resource_search_vector_update ON "Resource";
CREATE TRIGGER resource_search_vector_update
  BEFORE INSERT OR UPDATE ON "Resource"
  FOR EACH ROW EXECUTE FUNCTION update_resource_search_vector();

-- 5. Force-recompute for all existing resources
UPDATE "Resource" SET search_vector = NULL;

UPDATE "Resource" SET search_vector =
  setweight(to_tsvector('french', COALESCE(title, '')), 'A') ||
  setweight(to_tsvector('french', COALESCE(description, '')), 'B') ||
  setweight(to_tsvector('arabic', COALESCE(title, '')), 'A') ||
  setweight(to_tsvector('arabic', COALESCE(description, '')), 'B') ||
  setweight(to_tsvector('simple', COALESCE(tags, '')), 'C');

-- 6. Verify
SELECT
  COUNT(*) AS total_resources,
  COUNT(search_vector) AS with_search_vector,
  pg_size_pretty(pg_total_relation_size('"Resource"')) AS table_size
FROM "Resource";
