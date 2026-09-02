require('dotenv').config({ path: '/workspace/edutunisie/.env.local' });
const { PrismaClient } = require('/workspace/edutunisie/node_modules/@prisma/client');
const p = new PrismaClient({ log: ['error'] });
(async () => {
  // Count files updated in last 30 min
  const updated = await p.resourceMetadata.count({
    where: {
      extractedAt: { gt: new Date(Date.now() - 30 * 60 * 1000) }
    }
  });
  console.log(`ResourceMetadata updated in last 30 min: ${updated}`);
  
  // Sample of recent
  const recent = await p.$queryRaw`
    SELECT r."numericId", rm."generalSubject", rm."extractedAt"
    FROM "ResourceMetadata" rm
    JOIN "Resource" r ON r.id = rm."resourceId"
    WHERE rm."extractedAt" > NOW() - INTERVAL '30 minutes'
      AND r."subjectId" IN (SELECT id FROM "Subject" WHERE slug = 'physique')
    ORDER BY rm."extractedAt" DESC
    LIMIT 10
  `;
  console.log('\n=== Recent updates ===');
  for (const r of recent) {
    console.log(`  #${r.numericId} ${r.extractedAt}: "${r.generalSubject?.substring(0, 50)}"`);
  }
  await p.$disconnect();
})();
