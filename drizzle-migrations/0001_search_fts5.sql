-- ============================================================================
-- FTS5 search setup for Resource table (D1 / SQLite)
-- 2026-08-26: Migrating from Postgres tsvector to SQLite FTS5
--
-- Two virtual tables:
--   resource_fts         - For FR/Latin text (unicode61 tokenizer)
--   resource_fts_trigram - For AR/CJK text (trigram tokenizer)
--
-- Both tables use external content (no data duplication) linked to Resource
-- via rowid. Triggers keep them in sync.
--
-- Trade-off vs Postgres tsvector:
--   - FTS5 unicode61 doesn't have language-specific stemming (no FR/AR dictionaries)
--   - Quality for AR will decrease; we'll fallback to LIKE for AR queries
--   - Stemming for FR: still works because unicode61 handles accented chars
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. resource_fts (FR / Latin text using unicode61)
-- ----------------------------------------------------------------------------
CREATE VIRTUAL TABLE IF NOT EXISTS resource_fts USING fts5(
  title,
  description,
  tags,
  content='Resource',
  content_rowid='numericId',
  tokenize='unicode61 remove_diacritics 2'
);

-- ----------------------------------------------------------------------------
-- 2. resource_fts_trigram (AR / CJK / multi-byte text using trigram)
--    - trigram tokenizes every 3-char sequence, perfect for non-Latin scripts
--    - Catches substrings: "الرياضيات" matches "رياض"
-- ----------------------------------------------------------------------------
CREATE VIRTUAL TABLE IF NOT EXISTS resource_fts_trigram USING fts5(
  title,
  description,
  tags,
  content='Resource',
  content_rowid='numericId',
  tokenize='trigram'
);

-- ----------------------------------------------------------------------------
-- 3. Triggers to keep FTS tables in sync with Resource
-- ----------------------------------------------------------------------------

-- AI (After Insert)
CREATE TRIGGER IF NOT EXISTS resource_fts_ai AFTER INSERT ON Resource
WHEN NEW."status" = 'PUBLISHED'
BEGIN
  INSERT INTO resource_fts(rowid, title, description, tags)
  VALUES (NEW.numericId, COALESCE(NEW.title, ''), COALESCE(NEW.description, ''), COALESCE(NEW.tags, ''));

  INSERT INTO resource_fts_trigram(rowid, title, description, tags)
  VALUES (NEW.numericId, COALESCE(NEW.title, ''), COALESCE(NEW.description, ''), COALESCE(NEW.tags, ''));
END;

--> statement-breakpoint

-- AD (After Delete)
CREATE TRIGGER IF NOT EXISTS resource_fts_ad AFTER DELETE ON Resource
BEGIN
  INSERT INTO resource_fts(resource_fts, rowid, title, description, tags)
  VALUES ('delete', OLD.numericId, COALESCE(OLD.title, ''), COALESCE(OLD.description, ''), COALESCE(OLD.tags, ''));

  INSERT INTO resource_fts_trigram(resource_fts_trigram, rowid, title, description, tags)
  VALUES ('delete', OLD.numericId, COALESCE(OLD.title, ''), COALESCE(OLD.description, ''), COALESCE(OLD.tags, ''));
END;

--> statement-breakpoint

-- AU (After Update)
CREATE TRIGGER IF NOT EXISTS resource_fts_au AFTER UPDATE ON Resource
BEGIN
  -- Always delete old entry from FTS
  INSERT INTO resource_fts(resource_fts, rowid, title, description, tags)
  VALUES ('delete', OLD.numericId, COALESCE(OLD.title, ''), COALESCE(OLD.description, ''), COALESCE(OLD.tags, ''));

  INSERT INTO resource_fts_trigram(resource_fts_trigram, rowid, title, description, tags)
  VALUES ('delete', OLD.numericId, COALESCE(OLD.title, ''), COALESCE(OLD.description, ''), COALESCE(OLD.tags, ''));

  -- Insert new entry if status is PUBLISHED
  INSERT INTO resource_fts(rowid, title, description, tags)
  SELECT NEW.numericId, COALESCE(NEW.title, ''), COALESCE(NEW.description, ''), COALESCE(NEW.tags, '')
  WHERE NEW."status" = 'PUBLISHED';

  INSERT INTO resource_fts_trigram(rowid, title, description, tags)
  SELECT NEW.numericId, COALESCE(NEW.title, ''), COALESCE(NEW.description, ''), COALESCE(NEW.tags, '')
  WHERE NEW."status" = 'PUBLISHED';
END;

--> statement-breakpoint

-- ----------------------------------------------------------------------------
-- 4. Initial population: insert all existing PUBLISHED resources
-- ----------------------------------------------------------------------------
INSERT INTO resource_fts(rowid, title, description, tags)
SELECT
  numericId,
  COALESCE(title, ''),
  COALESCE(description, ''),
  COALESCE(tags, '')
FROM Resource
WHERE "status" = 'PUBLISHED' AND numericId IS NOT NULL;

--> statement-breakpoint

INSERT INTO resource_fts_trigram(rowid, title, description, tags)
SELECT
  numericId,
  COALESCE(title, ''),
  COALESCE(description, ''),
  COALESCE(tags, '')
FROM Resource
WHERE "status" = 'PUBLISHED' AND numericId IS NOT NULL;

--> statement-breakpoint

-- ----------------------------------------------------------------------------
-- 5. Verify
-- ----------------------------------------------------------------------------
SELECT
  'resource_fts' as table_name,
  COUNT(*) as count
FROM resource_fts
UNION ALL
SELECT
  'resource_fts_trigram' as table_name,
  COUNT(*) as count
FROM resource_fts_trigram;
