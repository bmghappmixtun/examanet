require('dotenv').config({ path: '/workspace/edutunisie/.env.local' });
const { PrismaClient } = require('/workspace/edutunisie/node_modules/@prisma/client');
const p = new PrismaClient({ log: ['error'] });
(async () => {
  const f = await p.$queryRaw`
    SELECT r."numericId", r.description, r.tags, rm."generalSubject", rm."schoolName", rm.topics
    FROM "Resource" r
    JOIN "ResourceMetadata" rm ON rm."resourceId" = r.id
    WHERE r."numericId" = 11028
  `;
  console.log(`#${f[0].numericId}:`);
  console.log(`  description: ${f[0].description?.substring(0, 200)}`);
  console.log(`  generalSubject: ${f[0].generalSubject}`);
  console.log(`  schoolName: ${f[0].schoolName}`);
  console.log(`  topics: ${JSON.stringify(f[0].topics)}`);
  console.log(`  tags: ${f[0].tags?.substring(0, 100)}`);
  await p.$disconnect();
})();
