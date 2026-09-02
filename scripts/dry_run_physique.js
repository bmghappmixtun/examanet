require('dotenv').config({ path: '/workspace/edutunisie/.env.local' });
const { PrismaClient } = require('/workspace/edutunisie/node_modules/@prisma/client');
const p = new PrismaClient({ log: ['error'] });
(async () => {
  const files = await p.$queryRaw`
    SELECT r."numericId", r.title, cnt."pageCount", array_length(rm."keyInsights", 1) as ki
    FROM "Resource" r
    JOIN "Subject" s ON r."subjectId" = s.id
    JOIN "ResourceContent" cnt ON cnt."resourceId" = r.id
    LEFT JOIN "ResourceMetadata" rm ON rm."resourceId" = r.id
    WHERE r.status = 'PUBLISHED'
      AND s.slug = 'physique'
      AND cnt."pageCount" BETWEEN 30 AND 59
      AND (rm."modelUsed" IS NULL OR rm."modelUsed" != 'gpt-4o-mini-reprocess-physique-v1')
    ORDER BY cnt."pageCount" DESC
  `;
  console.log(`Files to process: ${files.length}`);
  for (const f of files) {
    console.log(`  #${f.numericId} pages=${f.pageCount} kI=${f.ki || 0}: ${f.title.substring(0, 60)}`);
  }
  await p.$disconnect();
})();
