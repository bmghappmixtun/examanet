require('dotenv').config({ path: '/workspace/edutunisie/.env.local' });
const { PrismaClient } = require('/workspace/edutunisie/node_modules/@prisma/client');
const p = new PrismaClient({ log: ['error'] });
(async () => {
  // Get a sample of files with generalSubject values that should have been updated
  const samples = await p.$queryRaw`
    SELECT r."numericId", rm."generalSubject", rm.topics
    FROM "Resource" r
    JOIN "ResourceMetadata" rm ON rm."resourceId" = r.id
    WHERE r."subjectId" IN (SELECT id FROM "Subject" WHERE slug = 'physique')
      AND r.status = 'PUBLISHED'
    ORDER BY RANDOM()
    LIMIT 30
  `;
  for (const f of samples) {
    console.log(`#${f.numericId}: GS="${f.generalSubject?.substring(0, 60)}" topics=${JSON.stringify(f.topics?.slice(0, 3))}`);
  }
  await p.$disconnect();
})();
