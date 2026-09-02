require('dotenv').config({ path: '/workspace/edutunisie/.env.local' });
const { PrismaClient } = require('/workspace/edutunisie/node_modules/@prisma/client');
const p = new PrismaClient({ log: ['error'] });
(async () => {
  const counts = await p.$queryRaw`
    SELECT rm."modelUsed", COUNT(*) as total,
      COUNT(r.tags) FILTER (WHERE r.tags IS NOT NULL AND r.tags != '') as with_tags
    FROM "ResourceMetadata" rm
    JOIN "Resource" r ON r.id = rm."resourceId"
    JOIN "Class" c ON r."classId" = c.id
    JOIN "Level" l ON c."levelId" = l.id
    WHERE l.slug = 'lycee' AND r."subjectId" IN (SELECT id FROM "Subject" WHERE slug = 'physique') AND r.status = 'PUBLISHED'
    GROUP BY rm."modelUsed"
  `;
  for (const c of counts) {
    console.log(`  ${c.modelUsed || 'NULL'}: total=${c.total}, with_tags=${c.with_tags}`);
  }
  await p.$disconnect();
})();
