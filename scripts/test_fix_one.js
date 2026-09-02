const { PrismaClient } = require('/workspace/edutunisie/node_modules/@prisma/client');
require('dotenv').config({ path: '/workspace/edutunisie/.env.local' });
const p = new PrismaClient({ log: ['error'] });
(async () => {
  // Get a few files
  const files = await p.$queryRaw`
    SELECT rm.id as rmId, r."numericId", rm."generalSubject", rm.topics
    FROM "ResourceMetadata" rm
    JOIN "Resource" r ON r.id = rm."resourceId"
    WHERE r.status = 'PUBLISHED' AND r."subjectId" IN (SELECT id FROM "Subject" WHERE slug = 'physique')
      AND rm."generalSubject" = 'Physique et Chimie'
    LIMIT 5
  `;
  for (const f of files) {
    console.log(`#${f.numericId}: ${f.generalSubject} → topics: ${JSON.stringify(f.topics?.slice(0, 3))}`);
  }
  await p.$disconnect();
})();
