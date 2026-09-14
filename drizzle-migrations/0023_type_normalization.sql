-- Migration 0023: Normalize Resource.type values to canonical English enum
-- 
-- The DB accumulated 3 sets of duplicate types from various import scripts and
-- AI extraction. Normalize them so /fr/ressources type filter shows unique entries.
--
-- Canonical values (English):
--   COURSE (Cours), DEVOIR (Devoir), EXERCISE (Exercice),
--   BAC_SUBJECT (Sujet Bac), CORRECTION (Corrigé), EXAM (Examen),
--   OTHER (Autre), REVISION (Révision), SUMMARY (Résumé)
--
-- Duplicates to merge:
--   HOMEWORK (434) → DEVOIR  (English translation of "devoir")
--   COURS    (31)  → COURSE  (French variant of canonical English value)
--   EXERCICE (43)  → EXERCISE (French variant of canonical English value)

UPDATE Resource SET type = 'DEVOIR'  WHERE type = 'HOMEWORK';
UPDATE Resource SET type = 'COURSE'  WHERE type = 'COURS';
UPDATE Resource SET type = 'EXERCISE' WHERE type = 'EXERCICE';
