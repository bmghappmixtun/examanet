const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

(async () => {
  console.log('Step 1: Adding search_vector column (manual updated via trigger)...');

  // Create a regular column (not generated - will be updated by trigger)
  try {
    await p.$executeRawUnsafe(`ALTER TABLE "Resource" ADD COLUMN IF NOT EXISTS search_vector tsvector`);
    console.log('  ✓ Column added (will be populated by trigger)');
  } catch (e) {
    console.log('  ✗', e.message.slice(0, 200));
  }

  // Create function to update search_vector
  try {
    await p.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION update_resource_search_vector() RETURNS trigger AS $$
      BEGIN
        NEW.search_vector :=
          setweight(to_tsvector('french', coalesce(NEW.title, '')), 'A') ||
          setweight(to_tsvector('french', coalesce(NEW.description, '')), 'B') ||
          setweight(to_tsvector('arabic', coalesce(NEW.title, '')), 'A') ||
          setweight(to_tsvector('arabic', coalesce(NEW.description, '')), 'B') ||
          setweight(to_tsvector('simple', coalesce(array_to_string(NEW.tags, ' '), '')), 'C');
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);
    console.log('  ✓ Function created');
  } catch (e) {
    console.log('  ✗ Function:', e.message.slice(0, 200));
  }

  // Create trigger
  try {
    await p.$executeRawUnsafe('DROP TRIGGER IF EXISTS resource_search_vector_trigger ON "Resource"');
    await p.$executeRawUnsafe(`
      CREATE TRIGGER resource_search_vector_trigger
      BEFORE INSERT OR UPDATE OF title, description, tags ON "Resource"
      FOR EACH ROW EXECUTE FUNCTION update_resource_search_vector()
    `);
    console.log('  ✓ Trigger created');
  } catch (e) {
    console.log('  ✗ Trigger:', e.message.slice(0, 200));
  }

  // Populate existing rows
  try {
    await p.$executeRawUnsafe(`
      UPDATE "Resource" SET
        search_vector =
          setweight(to_tsvector('french', coalesce(title, '')), 'A') ||
          setweight(to_tsvector('french', coalesce(description, '')), 'B') ||
          setweight(to_tsvector('arabic', coalesce(title, '')), 'A') ||
          setweight(to_tsvector('arabic', coalesce(description, '')), 'B') ||
          setweight(to_tsvector('simple', coalesce(array_to_string(tags, ' '), '')), 'C')
    `);
    console.log('  ✓ Populated existing rows');
  } catch (e) {
    console.log('  ✗ Populate:', e.message.slice(0, 200));
  }

  // GIN index
  try {
    await p.$executeRawUnsafe('CREATE INDEX "Resource_search_vector_idx" ON "Resource" USING GIN (search_vector)');
    console.log('  ✓ GIN index created');
  } catch (e) {
    if (e.message.includes('already exists')) {
      console.log('  - GIN index already exists');
    } else {
      console.log('  ✗ GIN:', e.message.slice(0, 200));
    }
  }

  // Verify
  const verif = await p.$queryRaw`SELECT count(*)::int as cnt FROM "Resource" WHERE search_vector IS NOT NULL`;
  console.log(`\n✓ Rows with search_vector: ${verif[0].cnt}`);

  const sample = await p.$queryRaw`SELECT id, title, search_vector IS NOT NULL as has_vec FROM "Resource" LIMIT 3`;
  console.log('Sample rows:', sample);

  await p.$disconnect();
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
