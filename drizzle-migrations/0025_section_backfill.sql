-- Migration 0025: Section filter cleanup + auto-assignment from title
--
-- Problem: 99.99% of resources had sectionId = NULL (only 1/15421 was set).
-- This caused the Section filter on /fr/ressources to show only 1 entry.
-- Root causes:
--   1. Duplicate Section rows: 17 rows for 11 unique slugs (some seeds re-imported)
--   2. Resources imported without sectionId set (title had the section info)
--
-- Fix:
--   [1] Delete orphan duplicate Section rows (cmsyq... prefix - no Resource references them)
--   [2] Backfill sectionId from title pattern matching (priority order: most specific first)
--       Lycée resources in Tunisia carry section info in titles like "Section Mathématiques"
--       or "3AS Section Sciences Experimentales". Parse and assign the canonical sectionId.
--   [3] Collège resources (7-9ème) are left with sectionId = NULL — Tunisia has no sections in Collège.
--
-- Important: SQLite LOWER() is ASCII-only (doesn't fold É→E). Pattern matching for accented
-- characters uses GLOB (byte-exact, works with UTF-8) instead of LIKE. Without this, titles
-- with French accents (Section Économie, Section Éco) would be missed.

-- [1] Delete orphan duplicate Section rows
DELETE FROM Section WHERE id LIKE 'cmsyq%';

-- [2a] Backfill sectionId - accented patterns (GLOB, priority order: most specific first)
-- Section Sciences Exp → sciences-experimentales (catches Section Sciences exp(erimentales))
UPDATE Resource SET sectionId = (SELECT id FROM Section WHERE slug = 'sciences-experimentales')
WHERE status='PUBLISHED' AND isHidden=0 AND sectionId IS NULL
  AND classId IN (SELECT id FROM Class WHERE levelId='cmqi8nqzj00022n4ansnot863')
  AND title GLOB '*Section Sciences Exp*';

-- Section Sciences Info → sciences-informatique
UPDATE Resource SET sectionId = (SELECT id FROM Section WHERE slug = 'sciences-informatique')
WHERE status='PUBLISHED' AND isHidden=0 AND sectionId IS NULL
  AND classId IN (SELECT id FROM Class WHERE levelId='cmqi8nqzj00022n4ansnot863')
  AND title GLOB '*Section Sciences Info*';

-- Section Sciences (alone) → sciences
UPDATE Resource SET sectionId = (SELECT id FROM Section WHERE slug = 'sciences')
WHERE status='PUBLISHED' AND isHidden=0 AND sectionId IS NULL
  AND classId IN (SELECT id FROM Class WHERE levelId='cmqi8nqzj00022n4ansnot863')
  AND title GLOB '*Section Sciences*';

-- Section Math → maths
UPDATE Resource SET sectionId = (SELECT id FROM Section WHERE slug = 'maths')
WHERE status='PUBLISHED' AND isHidden=0 AND sectionId IS NULL
  AND classId IN (SELECT id FROM Class WHERE levelId='cmqi8nqzj00022n4ansnot863')
  AND title GLOB '*Section Math*';

-- Section Lettres → lettres
UPDATE Resource SET sectionId = (SELECT id FROM Section WHERE slug = 'lettres')
WHERE status='PUBLISHED' AND isHidden=0 AND sectionId IS NULL
  AND classId IN (SELECT id FROM Class WHERE levelId='cmqi8nqzj00022n4ansnot863')
  AND title GLOB '*Section Lettres*';

-- Section Éco(-nomie) → eco-gestion (covers Section Économie-Gestion, Section Économie, Section Éco...)
UPDATE Resource SET sectionId = (SELECT id FROM Section WHERE slug = 'eco-gestion')
WHERE status='PUBLISHED' AND isHidden=0 AND sectionId IS NULL
  AND classId IN (SELECT id FROM Class WHERE levelId='cmqi8nqzj00022n4ansnot863')
  AND title GLOB '*Section Éco*';

-- Section Technique → technique
UPDATE Resource SET sectionId = (SELECT id FROM Section WHERE slug = 'technique')
WHERE status='PUBLISHED' AND isHidden=0 AND sectionId IS NULL
  AND classId IN (SELECT id FROM Class WHERE levelId='cmqi8nqzj00022n4ansnot863')
  AND title GLOB '*Section Technique*';

-- Section Sport → sport
UPDATE Resource SET sectionId = (SELECT id FROM Section WHERE slug = 'sport')
WHERE status='PUBLISHED' AND isHidden=0 AND sectionId IS NULL
  AND classId IN (SELECT id FROM Class WHERE levelId='cmqi8nqzj00022n4ansnot863')
  AND title GLOB '*Section Sport*';

-- [2b] More specific patterns for secondary sections
-- Section Économie et services / Section 2ème Économie → eco-services
UPDATE Resource SET sectionId = (SELECT id FROM Section WHERE slug = 'eco-services')
WHERE status='PUBLISHED' AND isHidden=0 AND sectionId IS NULL
  AND classId IN (SELECT id FROM Class WHERE levelId='cmqi8nqzj00022n4ansnot863')
  AND (title GLOB '*Section *conomie*Services*' OR title GLOB '*Section *conomie et services*');

-- Section Technologies / Section TI → technologies-informatique
UPDATE Resource SET sectionId = (SELECT id FROM Section WHERE slug = 'technologies-informatique')
WHERE status='PUBLISHED' AND isHidden=0 AND sectionId IS NULL
  AND classId IN (SELECT id FROM Class WHERE levelId='cmqi8nqzj00022n4ansnot863')
  AND (title GLOB '*Section TI*' OR title GLOB '*Section Technologies*');

-- Section Anglais/Arabe/Français/Philosophie → lettres (humanities in Tunisia are in Lettres section)
UPDATE Resource SET sectionId = (SELECT id FROM Section WHERE slug = 'lettres')
WHERE status='PUBLISHED' AND isHidden=0 AND sectionId IS NULL
  AND classId IN (SELECT id FROM Class WHERE levelId='cmqi8nqzj00022n4ansnot863')
  AND (title GLOB '*Section Anglais*' OR title GLOB '*Section Arabe*' OR title GLOB '*Section Fran*ais*' OR title GLOB '*Section Philosophie*');

-- [3] "Bac Toutes Sections" and "Section -" (no specific section name) are LEFT as NULL
-- These are multi-section resources applicable to all sections, or have missing data.
