require('dotenv').config({ path: '/workspace/edutunisie/.env.local' });
const { PrismaClient } = require('/workspace/edutunisie/node_modules/@prisma/client');
const p = new PrismaClient({ log: ['error'] });
(async () => {
  const total = await p.resourceMetadata.count({
    where: {
      resource: { subject: { slug: 'physique' }, status: 'PUBLISHED' },
      generalSubject: { not: null }
    }
  });
  const remaining = await p.$queryRaw`
    SELECT rm."generalSubject", COUNT(*) as count
    FROM "ResourceMetadata" rm
    JOIN "Resource" r ON r.id = rm."resourceId"
    WHERE r.status = 'PUBLISHED' AND r."subjectId" IN (SELECT id FROM "Subject" WHERE slug = 'physique')
      AND rm."generalSubject" IS NOT NULL
    GROUP BY rm."generalSubject"
    ORDER BY count DESC
    LIMIT 20
  `;
  console.log('=== Top 20 generalSubjects now ===');
  for (const r of remaining) {
    console.log(`  ${r.count}x: ${r.generalSubject?.substring(0, 80)}`);
  }
  await p.$disconnect();
})();
