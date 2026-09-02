-- Initial schema baseline
-- This migration represents the cumulative schema state before any tracked migrations
-- were added. It captures all models, fields, relations, and indexes that existed
-- in the live database as of 2026-07-17.
--
-- To regenerate this file with the exact current schema, run:
--   npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script
--
-- For now, we mark this as applied without re-running it (the schema is already in place).

-- This is a marker migration only. The actual schema was created via `prisma db push`
-- before migrations were tracked. See prisma/migrations/README.md for the workflow.

SELECT 1;
