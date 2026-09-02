INSERT INTO "ResourceMetadata" ("id", "resourceId", "profNames", "systemName", "modelUsed")
SELECT gen_random_uuid()::text, r.id, ARRAY['TEST_NEW']::text[], 'TEST_NEW', 'gpt-4o-mini'
FROM "Resource" r WHERE r."numericId" = 12920
ON CONFLICT ("resourceId") DO UPDATE SET
  "profNames" = EXCLUDED."profNames",
  "systemName" = EXCLUDED."systemName"
RETURNING "profNames", "systemName", "schoolName"
