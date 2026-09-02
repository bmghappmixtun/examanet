require('dotenv').config({ path: '/workspace/edutunisie/.env.local' });
const { PrismaClient } = require('/workspace/edutunisie/node_modules/@prisma/client');
const p = new PrismaClient({ log: ['error'] });
(async () => {
  const f = await p.$queryRaw`
    SELECT r."numericId", r.tags, rm.topics
    FROM "Resource" r
    JOIN "ResourceMetadata" rm ON rm."resourceId" = r.id
    WHERE r."numericId" = 11028
  `;
  console.log(`#${f[0].numericId}:`);
  console.log(`  tags: ${f[0].tags}`);
  console.log(`  topics: ${JSON.stringify(f[0].topics)}`);
  await p.$disconnect();
})();
