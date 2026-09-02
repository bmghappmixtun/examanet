INSERT INTO "ResourceMetadata" (
  "id", "resourceId", "profNames", "schoolName", "year", "systemName",
  "dossierTechnique", "subject", "difficulty", "topics", "keyPoints", "modelUsed"
)
SELECT
  gen_random_uuid()::text,
  r.id,
  ARRAY['HENI ABDELLATIF']::text[],
  'Lycée Sec. Mazzouna',
  '2013-2014',
  'Pots de fleurs',
  'Génie mécanique',
  'Technologie',
  'moyen',
  ARRAY['Génie Mécanique', 'Fabrication']::text[],
  ARRAY['test1', 'test2']::text[],
  'gpt-4o-mini'
FROM "Resource" r WHERE r."numericId" = 12920
RETURNING "resourceId"
