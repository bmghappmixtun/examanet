-- Add exerciseInsights field to ResourceMetadata
-- Stores exercise-by-exercise breakdown OR section-by-section for courses
-- Format: "Exercice N: sujet - résumé" (DEVOIR/EXERCISE) or "Titre: résumé" (COURS)
ALTER TABLE "ResourceMetadata" ADD COLUMN IF NOT EXISTS "exerciseInsights" TEXT[] DEFAULT '{}'::TEXT[];
