-- Migration 0024: Reclassify rare/useless Resource.type entries
--
-- The "Type de ressource" filter on /fr/ressources was cluttered with 3 types
-- that had negligible counts and unclear value for filtering:
--   CORRECTION  (4)  - These are "Devoir Corrigé" → reclassify as DEVOIR
--   EXAM        (1)  - Exam is a form of test/devoir → reclassify as DEVOIR
--   BAC_SUBJECT (1)  - Bac subject is an exercise set → reclassify as EXERCISE
--
-- Result: filter shows 6 meaningful types instead of 9.
--   Devoir, Exercice, Cours, Autre, Résumé, Révision
--
-- Data preserved: no resources deleted, no count loss. Just normalized
-- the type into a more useful category.

UPDATE Resource SET type = 'DEVOIR'   WHERE type = 'CORRECTION';
UPDATE Resource SET type = 'DEVOIR'   WHERE type = 'EXAM';
UPDATE Resource SET type = 'EXERCISE' WHERE type = 'BAC_SUBJECT';
