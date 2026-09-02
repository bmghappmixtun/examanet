# Prisma Migrations

## Workflow

**For schema changes (new field, new index, etc.)**:
```bash
# 1. Edit prisma/schema.prisma
# 2. Create a new migration
npx prisma migrate dev --name descriptive_name

# This will:
# - Generate the SQL migration
# - Apply it to dev DB
# - Regenerate the Prisma client
```

**For perf-only changes that already exist in the DB**:
```bash
# 1. Write the SQL manually in a new migration folder
# 2. Mark it as applied (don't re-run)
npx prisma migrate resolve --applied MIGRATION_NAME
```

## History

- `20260101_initial_schema` — baseline (schema existed before migrations were tracked)
- `20260714_add_api_providers` — added ApiProvider + ApiProviderUsage tables
- `20260717_add_perf_indexes` — added 3 partial indexes for facet queries

## Why so few migrations?

Most schema changes before 2026-07-14 were applied via `prisma db push` (no migration history).
The baseline migration captures the cumulative state as of 2026-07-17.

From 2026-07-17 onwards, all changes use `prisma migrate dev`.
