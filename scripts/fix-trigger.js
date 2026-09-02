const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

(async () => {
  console.log('Fixing trigger function with proper text[] handling...');
  await p.$executeRawUnsafe(`
    CREATE OR REPLACE FUNCTION update_resource_search_vector() RETURNS trigger AS $$
    BEGIN
      NEW.search_vector :=
        setweight(to_tsvector('french', coalesce(NEW.title, '')), 'A') ||
        setweight(to_tsvector('french', coalesce(NEW.description, '')), 'B') ||
        setweight(to_tsvector('arabic', coalesce(NEW.title, '')), 'A') ||
        setweight(to_tsvector('arabic', coalesce(NEW.description, '')), 'B') ||
        setweight(to_tsvector('simple', coalesce(array_to_string(NEW.tags::text[], ' '), '')), 'C');
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);
  console.log('  ✓ Function fixed');

  // Repopulate
  console.log('Repopulating...');
  const allRows = await p.resource.findMany({ select: { id: true } });
  for (const r of allRows) {
    await p.$executeRawUnsafe(`UPDATE "Resource" SET title = title WHERE id = '${r.id}'`);
  }
  
  const verif = await p.$queryRaw`SELECT count(*)::int as cnt FROM "Resource" WHERE search_vector IS NOT NULL`;
  console.log(`✓ Rows with search_vector: ${verif[0].cnt}`);

  // Show sample
  const sample = await p.$queryRaw`SELECT title, length(search_vector::text) as vec_len FROM "Resource" WHERE search_vector IS NOT NULL LIMIT 3`;
  console.log('Sample:', sample);

  await p.$disconnect();
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
