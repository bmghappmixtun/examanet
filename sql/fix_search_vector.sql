-- Update search_vector trigger function to include AI-extracted content
-- from ResourceMetadata and ResourceSummary tables.
--
-- This is critical because the search bar at /recherche is what users see
-- when they click on a topic link from the prof page. Without this, searching
-- for "Moteurs", "DEPALETTISEUR", etc. returns 0 results.

CREATE OR REPLACE FUNCTION resource_search_vector_update() RETURNS trigger AS $$
DECLARE
  ai_text TEXT;
BEGIN
  -- Aggregate AI-extracted text from related tables (if any)
  SELECT
    COALESCE(
      -- topics
      (SELECT string_agg(t, ' ') FROM unnest(COALESCE(m.topics, '{}'::text[])) AS t),
      ''
    ) || ' ' ||
    COALESCE(
      -- keyPoints
      (SELECT string_agg(t, ' ') FROM unnest(COALESCE(m.keyPoints, '{}'::text[])) AS t),
      ''
    ) || ' ' ||
    COALESCE(m.systemName, '') || ' ' ||
    COALESCE(m.dossierTechnique, '') || ' ' ||
    COALESCE(m.subject, '') || ' ' ||
    COALESCE((SELECT string_agg(t, ' ') FROM unnest(COALESCE(m.profNames, '{}'::text[])) AS t), '') || ' ' ||
    COALESCE(m.schoolName, '') || ' ' ||
    COALESCE(s.summary, '')
  INTO ai_text
  FROM "Resource" r
  LEFT JOIN "ResourceMetadata" m ON m."resourceId" = r.id
  LEFT JOIN "ResourceSummary" s ON s."resourceId" = r.id
  WHERE r.id = NEW.id;

  NEW.search_vector :=
    setweight(to_tsvector('french', COALESCE(NEW.title, '')), 'A') ||
    setweight(to_tsvector('french', COALESCE(NEW.description, '')), 'B') ||
    setweight(to_tsvector('french', COALESCE(NEW.tags, '')), 'C') ||
    setweight(to_tsvector('french', COALESCE(NEW.schoolName, '')), 'C') ||
    setweight(to_tsvector('french', COALESCE(ai_text, '')), 'B');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Re-run the trigger to rebuild search vectors for existing resources
-- (this fixes the 0 results issue for any resource that has AI metadata)
UPDATE "Resource" SET "updatedAt" = NOW();
