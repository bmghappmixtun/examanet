const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

(async () => {
  // Drop+recreate pattern to avoid IF NOT EXISTS issues with trigram
  const trigramIndexes = [
    { table: 'Resource', col: 'title', name: 'Resource_title_trgm_idx', sql: 'CREATE INDEX "Resource_title_trgm_idx" ON "Resource" USING GIN (title gin_trgm_ops)' },
    { table: 'User', col: 'name', name: 'User_name_trgm_idx', sql: 'CREATE INDEX "User_name_trgm_idx" ON "User" USING GIN ((firstName || \' \' || lastName) gin_trgm_ops)' },
    { table: 'Subject', col: 'nameFr', name: 'Subject_name_trgm_idx', sql: 'CREATE INDEX "Subject_name_trgm_idx" ON "Subject" USING GIN (nameFr gin_trgm_ops)' },
    { table: 'Class', col: 'nameFr', name: 'Class_name_trgm_idx', sql: 'CREATE INDEX "Class_name_trgm_idx" ON "Class" USING GIN (nameFr gin_trgm_ops)' },
  ];

  console.log('Adding trigram indexes for typo-tolerant search...');
  for (const idx of trigramIndexes) {
    try {
      await p.$executeRawUnsafe(`DROP INDEX IF EXISTS "${idx.name}"`);
      await p.$executeRawUnsafe(idx.sql);
      console.log('  ✓', idx.name);
    } catch (e) {
      console.log('  ✗', idx.name, '-', e.message.slice(0, 80));
    }
  }

  // Test typo tolerance: "mathmatique" should find "mathematique"
  console.log('\nTest typo tolerance:');
  const typo1 = await p.$queryRaw`
    SELECT id, title FROM "Resource"
    WHERE title % 'mathmatique'
    OR title ILIKE '%mathmatique%'
    LIMIT 3
  `;
  console.log('  "mathmatique" →', typo1.length, 'results');

  await p.$disconnect();
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
