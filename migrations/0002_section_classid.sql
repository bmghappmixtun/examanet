-- Migration 0002: Add Section.classId column
-- 2026-09-04: Section table was missing classId (FK to Class) — search page was broken
-- because /recherche page query did "SELECT id, nameFr, slug, classId FROM Section" and
-- D1 threw "no such column: classId", causing Suspense to hang.
-- The page showed a loading spinner forever. Backfill from Neon (17 rows).

ALTER TABLE Section ADD COLUMN classId TEXT REFERENCES "Class"(id) ON DELETE CASCADE;

-- 17 rows backfilled via D1 API:
-- UPDATE Section SET classId = ? WHERE id = ?
-- All 17 Neon Section rows have a valid classId pointing to Class.id
-- Source: postgresql://edutunisie_app@neon
