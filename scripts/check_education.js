require('dotenv').config({ path: '/workspace/edutunisie/.env.local' });
const { PrismaClient } = require('/workspace/edutunisie/node_modules/@prisma/client');
const p = new PrismaClient({ log: ['error'] });
(async () => {
  const files = await p.$queryRaw`
    SELECT r."numericId", r.title, rm."generalSubject", rm.topics
    FROM "ResourceMetadata" rm
    JOIN "Resource" r ON r.id = rm."resourceId"
    WHERE rm."generalSubject" = 'Éducation'
    LIMIT 5
  `;
  for (const f of files) {
    console.log(`#${f.numericId}: ${f.title.substring(0, 60)}`);
    console.log(`  topics: ${JSON.stringify(f.topics)}`);
  }
  await p.$disconnect();
})();
