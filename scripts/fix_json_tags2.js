require('dotenv').config({ path: '/workspace/edutunisie/.env.local' });
const { PrismaClient } = require('/workspace/edutunisie/node_modules/@prisma/client');
const p = new PrismaClient({ log: ['error'] });
(async () => {
  const candidates = await p.$queryRaw`
    SELECT id, "numericId", tags FROM "Resource" 
    WHERE tags LIKE '{%' AND tags LIKE '%}%'
    LIMIT 5
  `;
  for (const c of candidates) {
    console.log(`#${c.numericId}: ${c.tags.substring(0, 100)}`);
  }
  
  // Try to parse as JSON-set format: {"a","b","c"}
  // Use regex to extract strings
  const allJson = await p.$queryRaw`
    SELECT id, "numericId", tags FROM "Resource" 
    WHERE tags LIKE '{%"'
  `;
  console.log(`\nJSON-set format candidates: ${allJson.length}`);
  let fixed = 0;
  for (const f of allJson) {
    if (!f.tags) continue;
    // Extract strings between quotes
    const matches = f.tags.match(/"([^"]+)"/g);
    if (matches && matches.length > 0) {
      const values = matches.map(m => m.slice(1, -1));
      const csv = values.join(', ');
      await p.resource.update({ where: { id: f.id }, data: { tags: csv } });
      fixed++;
    }
  }
  console.log(`Fixed ${fixed} files`);
  await p.$disconnect();
})();
