const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

(async () => {
  // Run a per-row update to fire the trigger
  const rows = await p.$queryRaw`SELECT id FROM "Resource"`;
  console.log(`Updating ${rows.length} rows one by one to fire trigger...`);
  
  for (const row of rows) {
    await p.$executeRaw`UPDATE "Resource" SET title = title WHERE id = ${row.id}`;
  }
  
  const verif = await p.$queryRaw`SELECT count(*)::int as cnt FROM "Resource" WHERE search_vector IS NOT NULL`;
  console.log(`✓ Rows with search_vector: ${verif[0].cnt}`);

  // If still 0, populate manually
  if (verif[0].cnt === 0) {
    console.log('Manually populating...');
    const allRows = await p.resource.findMany({ select: { id: true, title: true, description: true, tags: true } });
    for (const r of allRows) {
      const title = r.title || '';
      const desc = r.description || '';
      const tags = (r.tags || []).join(' ');
      await p.$executeRawUnsafe(
        `UPDATE "Resource" SET search_vector = 
          setweight(to_tsvector('french', $1), 'A') ||
          setweight(to_tsvector('french', $2), 'B') ||
          setweight(to_tsvector('arabic', $1), 'A') ||
          setweight(to_tsvector('arabic', $2), 'B') ||
          setweight(to_tsvector('simple', $3), 'C')
         WHERE id = $4`,
        title, desc, tags, r.id
      );
    }
    const after = await p.$queryRaw`SELECT count(*)::int as cnt FROM "Resource" WHERE search_vector IS NOT NULL`;
    console.log(`✓ After manual: ${after[0].cnt}`);
  }

  await p.$disconnect();
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
