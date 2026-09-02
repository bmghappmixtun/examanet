require('dotenv').config({ path: '/workspace/edutunisie/.env.local' });
const { PrismaClient } = require('/workspace/edutunisie/node_modules/@prisma/client');
const p = new PrismaClient({ log: ['error'] });
(async () => {
  let lastId = '';
  let fixed = 0;
  const BATCH = 100;
  while (true) {
    const allJson = await p.$queryRaw`
      SELECT id, "numericId", tags FROM "Resource" 
      WHERE tags LIKE '{"%' AND id > ${lastId}
      ORDER BY id ASC
      LIMIT ${BATCH}
    `;
    if (allJson.length === 0) break;
    for (const f of allJson) {
      if (!f.tags) continue;
      const matches = f.tags.match(/"((?:[^"\\]|\\.)*)"/g);
      if (matches && matches.length > 0) {
        const values = matches.map(m => m.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\'));
        const csv = values.join(', ');
        await p.resource.update({ where: { id: f.id }, data: { tags: csv } });
        fixed++;
      }
    }
    lastId = allJson[allJson.length - 1].id;
    console.log(`  fixed=${fixed}, lastId=${lastId.substring(0, 10)}...`);
  }
  console.log(`Total fixed: ${fixed}`);
  await p.$disconnect();
})();
