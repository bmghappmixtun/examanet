require('dotenv').config({ path: '/workspace/edutunisie/.env.local' });
const { PrismaClient } = require('/workspace/edutunisie/node_modules/@prisma/client');
const p = new PrismaClient({ log: ['error'] });
(async () => {
  // Use a more flexible pattern
  const allJson = await p.$queryRaw`
    SELECT id, "numericId", tags FROM "Resource" 
    WHERE tags LIKE '{"%'
  `;
  console.log(`Candidates: ${allJson.length}`);
  
  let fixed = 0;
  for (const f of allJson) {
    if (!f.tags) continue;
    // Extract strings between double quotes (even with escaped quotes)
    const matches = f.tags.match(/"((?:[^"\\]|\\.)*)"/g);
    if (matches && matches.length > 0) {
      const values = matches.map(m => m.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\'));
      const csv = values.join(', ');
      await p.resource.update({ where: { id: f.id }, data: { tags: csv } });
      fixed++;
      if (fixed <= 3) console.log(`  Fixed #${f.numericId}: ${values.length} tags`);
    }
  }
  console.log(`Fixed ${fixed} files`);
  await p.$disconnect();
})();
