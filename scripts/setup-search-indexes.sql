-- ============================================================================
-- Search engine setup: PostgreSQL Full-Text Search + Trigram + Indexes
-- Run this script to enable ultra-fast search
-- ============================================================================

-- 1. Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_trgm;      -- Trigram (typo-tolerant)
CREATE EXTENSION IF NOT EXISTS unaccent;     -- Remove accents for search

-- 2. Helper function: normalize text (lowercase, unaccent, trim)
CREATE OR REPLACE FUNCTION normalize_text(text) RETURNS text AS $$
  SELECT lower(unaccent(trim($1)));
$$ LANGUAGE SQL IMMUTABLE;

-- 3. Add search_vector column to Resource (auto-computed)
-- We use a stored generated column for performance
ALTER TABLE "Resource"
  ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('french', coalesce(unaccent(title), '')), 'A') ||
    setweight(to_tsvector('french', coalesce(unaccent(description), '')), 'B') ||
    setweight(to_tsvector('arabic', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('arabic', coalesce(description, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(tags::text, '')), 'C')
  ) STORED;

-- 4. GIN index on search_vector (full-text search)
CREATE INDEX IF NOT EXISTS "Resource_search_vector_idx"
  ON "Resource" USING GIN (search_vector);

-- 5. Trigram indexes (typo-tolerant search)
CREATE INDEX IF NOT EXISTS "Resource_title_trgm_idx"
  ON "Resource" USING GIN (unaccent(title) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "Resource_description_trgm_idx"
  ON "Resource" USING GIN (unaccent(description) gin_trgm_ops);

-- 6. Indexes for filters
CREATE INDEX IF NOT EXISTS "Resource_status_published_idx"
  ON "Resource" (status, publishedAt DESC) WHERE status = 'PUBLISHED';

CREATE INDEX IF NOT EXISTS "Resource_subjectId_published_idx"
  ON "Resource" (subjectId, publishedAt DESC) WHERE status = 'PUBLISHED';

CREATE INDEX IF NOT EXISTS "Resource_classId_published_idx"
  ON "Resource" (classId, publishedAt DESC) WHERE status = 'PUBLISHED';

CREATE INDEX IF NOT EXISTS "Resource_teacherId_published_idx"
  ON "Resource" (teacherId, publishedAt DESC) WHERE status = 'PUBLISHED';

CREATE INDEX IF NOT EXISTS "Resource_type_published_idx"
  ON "Resource" (type, publishedAt DESC) WHERE status = 'PUBLISHED';

CREATE INDEX IF NOT EXISTS "Resource_viewsCount_idx"
  ON "Resource" (viewsCount DESC) WHERE status = 'PUBLISHED';

CREATE INDEX IF NOT EXISTS "Resource_downloadsCount_idx"
  ON "Resource" (downloadsCount DESC) WHERE status = 'PUBLISHED';

-- 7. Trigram on User (for teacher search)
CREATE INDEX IF NOT EXISTS "User_name_trgm_idx"
  ON "User" USING GIN (
    (unaccent(firstName) || ' ' || unaccent(lastName) || ' ' || unaccent(coalesce(schoolName, ''))) gin_trgm_ops
  );

CREATE INDEX IF NOT EXISTS "User_role_status_idx"
  ON "User" (role, status) WHERE role = 'TEACHER' AND status = 'ACTIVE';

-- 8. Trigram on Subject (for subject search)
CREATE INDEX IF NOT EXISTS "Subject_name_trgm_idx"
  ON "Subject" USING GIN (
    (unaccent(nameFr) || ' ' || coalesce(unaccent(nameAr), '')) gin_trgm_ops
  );

-- 9. Trigram on Class
CREATE INDEX IF NOT EXISTS "Class_name_trgm_idx"
  ON "Class" USING GIN (
    (unaccent(nameFr) || ' ' || coalesce(unaccent(nameAr), '')) gin_trgm_ops
  );

-- 10. Trigram on Section
CREATE INDEX IF NOT EXISTS "Section_name_trgm_idx"
  ON "Section" USING GIN (
    (unaccent(nameFr) || ' ' || coalesce(unaccent(nameAr), '')) gin_trgm_ops
  );

-- 11. Stats
ANALYZE "Resource";
ANALYZE "User";
ANALYZE "Subject";
ANALYZE "Class";
ANALYZE "Section";
