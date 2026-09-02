const fs = require('fs');
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

(async () => {
  // First, create extensions separately
  console.log('Creating extensions...');
  try {
    await p.$executeRawUnsafe('CREATE EXTENSION IF NOT EXISTS pg_trgm;');
    console.log('  ✓ pg_trgm');
  } catch (e) { console.log('  pg_trgm:', e.message.slice(0, 80)); }
  try {
    await p.$executeRawUnsafe('CREATE EXTENSION IF NOT EXISTS unaccent;');
    console.log('  ✓ unaccent');
  } catch (e) { console.log('  unaccent:', e.message.slice(0, 80)); }

  // Check if extensions are loaded
  const exts = await p.$queryRaw`SELECT extname FROM pg_extension WHERE extname IN ('pg_trgm', 'unaccent')`;
  console.log('Extensions loaded:', exts.map(e => e.extname).join(', '));

  // Now create the indexes (drop+recreate pattern to avoid IF NOT EXISTS issues)
  const indexes = [
    { name: 'Resource_search_vector_idx', sql: 'CREATE INDEX "Resource_search_vector_idx" ON "Resource" USING GIN (search_vector)' },
    { name: 'Resource_title_trgm_idx', sql: 'CREATE INDEX "Resource_title_trgm_idx" ON "Resource" USING GIN (unaccent(title) gin_trgm_ops)' },
    { name: 'Resource_description_trgm_idx', sql: 'CREATE INDEX "Resource_description_trgm_idx" ON "Resource" USING GIN (unaccent(description) gin_trgm_ops)' },
  ];

  for (const idx of indexes) {
    try {
      await p.$executeRawUnsafe(idx.sql);
      console.log('  ✓', idx.name);
    } catch (e) {
      if (e.message.includes('already exists')) {
        console.log('  -', idx.name, '(exists)');
      } else {
        console.log('  ✗', idx.name, '-', e.message.slice(0, 80));
      }
    }
  }

  // Add the search_vector column if it doesn't exist
  try {
    await p.$executeRawUnsafe(`ALTER TABLE "Resource" ADD COLUMN IF NOT EXISTS search_vector tsvector GENERATED ALWAYS AS (setweight(to_tsvector('french', coalesce(unaccent(title), '')), 'A') || setweight(to_tsvector('french', coalesce(description, '')), 'B') || setweight(to_tsvector('arabic', coalesce(title, '')), 'A') || setweight(to_tsvector('arabic', coalesce(description, '')), 'B')) STORED`);
    console.log('  ✓ search_vector column added');
  } catch (e) {
    console.log('  - search_vector:', e.message.slice(0, 100));
  }

  // Indexes on search_vector (GIN)
  try {
    await p.$executeRawUnsafe('CREATE INDEX "Resource_search_vector_idx" ON "Resource" USING GIN (search_vector)');
    console.log('  ✓ search_vector GIN index');
  } catch (e) {
    console.log('  - GIN index:', e.message.slice(0, 80));
  }

  // Filter indexes
  const filterIdx = [
    'CREATE INDEX "Resource_status_published_idx" ON "Resource" (status, "publishedAt" DESC) WHERE status = \'PUBLISHED\'',
    'CREATE INDEX "Resource_subjectId_published_idx" ON "Resource" ("subjectId", "publishedAt" DESC) WHERE status = \'PUBLISHED\'',
    'CREATE INDEX "Resource_classId_published_idx" ON "Resource" ("classId", "publishedAt" DESC) WHERE status = \'PUBLISHED\'',
    'CREATE INDEX "Resource_teacherId_published_idx" ON "Resource" ("teacherId", "publishedAt" DESC) WHERE status = \'PUBLISHED\'',
    'CREATE INDEX "Resource_type_published_idx" ON "Resource" (type, "publishedAt" DESC) WHERE status = \'PUBLISHED\'',
  ];
  for (const sql of filterIdx) {
    try {
      await p.$executeRawUnsafe(sql);
      console.log('  ✓', sql.split('"')[1]);
    } catch (e) {
      if (!e.message.includes('already exists')) {
        console.log('  -', e.message.slice(0, 80));
      }
    }
  }

  // Stats
  await p.$executeRawUnsafe('ANALYZE "Resource"');
  console.log('  ✓ ANALYZE done');

  // Verify
  const verif = await p.$queryRaw`
    SELECT column_name, data_type FROM information_schema.columns
    WHERE table_name = 'Resource' AND column_name = 'search_vector'
  `;
  console.log('search_vector column:', verif.length > 0 ? 'EXISTS' : 'MISSING');

  const idxList = await p.$queryRaw`
    SELECT indexname FROM pg_indexes WHERE tablename = 'Resource' AND indexname LIKE '%search%'
  `;
  console.log('Search indexes:', idxList.length);

  await p.$disconnect();
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
