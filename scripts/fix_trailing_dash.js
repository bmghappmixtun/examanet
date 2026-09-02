require('dotenv').config({ path: '/workspace/edutunisie/.env.local' });
const { PrismaClient } = require('/workspace/edutunisie/node_modules/@prisma/client');
const p = new PrismaClient({ log: ['error'] });
(async () => {
  // Find all generalSubject ending with " - " or having double dashes
  const bad = await p.$queryRaw`
    SELECT rm.id, r."numericId", rm."generalSubject"
    FROM "ResourceMetadata" rm
    JOIN "Resource" r ON r.id = rm."resourceId"
    WHERE r.status = 'PUBLISHED' AND r."subjectId" IN (SELECT id FROM "Subject" WHERE slug = 'physique')
      AND (rm."generalSubject" LIKE '% - ' OR rm."generalSubject" LIKE '% - -%' OR rm."generalSubject" LIKE ' - %')
  `;
  console.log(`Found ${bad.length} with trailing/leading dash issues`);
  for (const b of bad.slice(0, 10)) console.log(`  #${b.numericId}: "${b.generalSubject}"`);
  
  let success = 0;
  for (const b of bad) {
    let cleaned = b.generalSubject
      .replace(/\s+-\s*$/, '') // trailing " - "
      .replace(/^\s*-\s+/, '') // leading " - "
      .replace(/\s+-\s+-/g, ' -') // " - -" 
      .replace(/\s+-\s+-/g, ' -') // repeat
      .trim();
    if (cleaned !== b.generalSubject) {
      try {
        await p.resourceMetadata.update({ where: { id: b.id }, data: { generalSubject: cleaned } });
        success++;
      } catch (e) { console.error(`  FAIL #${b.numericId}: ${e.message}`); }
    }
  }
  console.log(`\nCleaned ${success} entries`);
  await p.$disconnect();
})();
