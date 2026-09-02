require('dotenv').config({ path: '/workspace/edutunisie/.env.local' });
const { PrismaClient } = require('/workspace/edutunisie/node_modules/@prisma/client');
const p = new PrismaClient({ log: ['error'] });
(async () => {
  const samples = await p.$queryRaw`
    SELECT rm.subject, rm."generalSubject", rm.topics, rm."modelUsed"
    FROM "ResourceMetadata" rm
    JOIN "Resource" r ON r.id = rm."resourceId"
    WHERE r.status = 'PUBLISHED' AND r."subjectId" IN (SELECT id FROM "Subject" WHERE slug = 'physique')
      AND rm."generalSubject" = 'Physique et Chimie'
    LIMIT 5
  `;
  for (const f of samples) {
    console.log(`Model: ${f.modelUsed}`);
    console.log(`  subject: ${f.subject}`);
    console.log(`  generalSubject: ${f.generalSubject}`);
    console.log(`  topics: ${JSON.stringify(f.topics)}`);
  }
  await p.$disconnect();
})();
