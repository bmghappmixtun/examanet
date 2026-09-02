const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

(async () => {
  console.log('Fixing trigger function for text tags...');
  await p.$executeRawUnsafe(`
    CREATE OR REPLACE FUNCTION update_resource_search_vector() RETURNS trigger AS $$
    BEGIN
      NEW.search_vector :=
        setweight(to_tsvector('french', coalesce(NEW.title, '')), 'A') ||
        setweight(to_tsvector('french', coalesce(NEW.description, '')), 'B') ||
        setweight(to_tsvector('arabic', coalesce(NEW.title, '')), 'A') ||
        setweight(to_tsvector('arabic', coalesce(NEW.description, '')), 'B') ||
        setweight(to_tsvector('simple', coalesce(NEW.tags, '')), 'C');
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);
  console.log('  ✓ Function fixed for text tags');

  // Repopulate all
  console.log('Repopulating all rows...');
  const result = await p.$executeRawUnsafe(`
    UPDATE "Resource" SET 
      search_vector = 
        setweight(to_tsvector('french', coalesce(title, '')), 'A') ||
        setweight(to_tsvector('french', coalesce(description, '')), 'B') ||
        setweight(to_tsvector('arabic', coalesce(title, '')), 'A') ||
        setweight(to_tsvector('arabic', coalesce(description, '')), 'B') ||
        setweight(to_tsvector('simple', coalesce(tags, '')), 'C')
  `);
  console.log(`  ✓ Updated ${result} rows`);

  const verif = await p.$queryRaw`SELECT count(*)::int as cnt FROM "Resource" WHERE search_vector IS NOT NULL`;
  console.log(`✓ Rows with search_vector: ${verif[0].cnt}`);

  // Test a search
  const test = await p.$queryRaw`
    SELECT id, title 
    FROM "Resource" 
    WHERE search_vector @@ to_tsquery('french', 'math')
    LIMIT 3
  `;
  console.log('Test search "math":', test);

  await p.$disconnect();
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
