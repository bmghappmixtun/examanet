require('dotenv').config({ path: '/workspace/edutunisie/.env.local' });
const { PrismaClient } = require('/workspace/edutunisie/node_modules/@prisma/client');
const p = new PrismaClient({ log: ['error'] });
(async () => {
  // Direct LIKE pattern
  const bad = await p.$queryRaw`
    SELECT id, "generalSubject" FROM "ResourceMetadata" 
    WHERE "generalSubject" LIKE '% -' 
       OR "generalSubject" LIKE '- %'
  `;
  console.log(`Found ${bad.length}`);
  for (const b of bad.slice(0, 5)) console.log(`  "${b.generalSubject}"`);
  
  let success = 0;
  for (const b of bad) {
    let cleaned = b.generalSubject
      .replace(/\s+-\s*$/, '')
      .replace(/^\s*-\s+/, '')
      .trim();
    if (cleaned !== b.generalSubject) {
      try {
        await p.resourceMetadata.update({ where: { id: b.id }, data: { generalSubject: cleaned } });
        success++;
      } catch (e) { console.error(`  FAIL: ${e.message}`); }
    }
  }
  console.log(`\nCleaned ${success} entries`);
  await p.$disconnect();
})();
