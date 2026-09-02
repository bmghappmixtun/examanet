require('dotenv').config({ path: '/workspace/edutunisie/.env.local' });
const { PrismaClient } = require('/workspace/edutunisie/node_modules/@prisma/client');
const p = new PrismaClient({ log: ['error'] });
(async () => {
  const samples = await p.$queryRaw`
    SELECT rm.id, r."numericId", rm."generalSubject", rm.topics
    FROM "ResourceMetadata" rm
    JOIN "Resource" r ON r.id = rm."resourceId"
    WHERE r."numericId" IN (13454, 13456, 13585, 14311, 14516, 14520, 15333)
  `;
  for (const f of samples) {
    console.log(`#${f.numericId}: GS="${f.generalSubject}"`);
    console.log(`  topics: ${JSON.stringify(f.topics)}`);
  }
  await p.$disconnect();
})();
