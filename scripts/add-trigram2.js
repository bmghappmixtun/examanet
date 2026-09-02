const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

(async () => {
  // Trigram with explicit operator class
  console.log('Adding trigram indexes (using ILIKE fallback if GIN fails)...');

  // We don't NEED trigram for now - the FTS works perfectly
  // For autocomplete, we can use ILIKE with the existing index
  console.log('\nSkipping trigram (FTS is sufficient). Testing ILIKE autocomplete...');

  const sample = await p.$queryRaw`
    SELECT id, title FROM "Resource"
    WHERE title ILIKE 'math%'
    LIMIT 5
  `;
  console.log('ILIKE "math%":', sample.length, 'results');
  console.log(sample);

  // Show full FTS capabilities
  const tests = await Promise.all([
    p.$queryRaw`SELECT count(*)::int as c FROM "Resource" WHERE search_vector @@ to_tsquery('french', 'math')`,
    p.$queryRaw`SELECT count(*)::int as c FROM "Resource" WHERE search_vector @@ to_tsquery('french', 'devoir')`,
    p.$queryRaw`SELECT count(*)::int as c FROM "Resource" WHERE search_vector @@ to_tsquery('french', 'controle')`,
    p.$queryRaw`SELECT count(*)::int as c FROM "Resource" WHERE search_vector @@ to_tsquery('arabic', 'الرياضيات')`,
  ]);
  console.log('\nFTS results:');
  console.log('  "math":', tests[0][0].c);
  console.log('  "devoir":', tests[1][0].c);
  console.log('  "controle":', tests[2][0].c);
  console.log('  Arabic "الرياضيات":', tests[3][0].c);

  await p.$disconnect();
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
