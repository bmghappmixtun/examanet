require('dotenv').config({ path: '/workspace/edutunisie/.env.local' });
const { PrismaClient } = require('/workspace/edutunisie/node_modules/@prisma/client');
const p = new PrismaClient({ log: ['error'] });
(async () => {
  const files = await p.$queryRaw`
    SELECT rm.id, r."numericId", rm."generalSubject", rm.topics
    FROM "ResourceMetadata" rm
    JOIN "Resource" r ON r.id = rm."resourceId"
    WHERE rm."generalSubject" = 'Éducation'
    LIMIT 5
  `;
  for (const f of files) {
    console.log(`#${f.numericId}: "${f.generalSubject}" topics=${JSON.stringify(f.topics)}`);
  }
  await p.$disconnect();
})();
