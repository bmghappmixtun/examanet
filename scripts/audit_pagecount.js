require('dotenv').config({ path: '/workspace/edutunisie/.env.local' });
const { PrismaClient } = require('/workspace/edutunisie/node_modules/@prisma/client');
const p = new PrismaClient({ log: ['error'] });
(async () => {
  // Distribution of page counts
  const dist = await p.$queryRaw`
    SELECT 
      CASE 
        WHEN cnt."pageCount" IS NULL THEN 'NULL'
        WHEN cnt."pageCount" = 0 THEN '0'
        WHEN cnt."pageCount" < 5 THEN '1-4'
        WHEN cnt."pageCount" < 15 THEN '5-14'
        WHEN cnt."pageCount" < 30 THEN '15-29'
        WHEN cnt."pageCount" < 60 THEN '30-59'
        ELSE '60+'
      END as bucket,
      COUNT(*) as count
    FROM "ResourceContent" cnt
    JOIN "Resource" r ON r.id = cnt."resourceId"
    WHERE r.status = 'PUBLISHED'
    GROUP BY bucket
    ORDER BY bucket
  `;
  console.log('=== Distribution des pageCount ===');
  for (const d of dist) {
    console.log(`  ${d.bucket}: ${d.count} fichiers`);
  }
  
  // Total files
  const total = await p.$queryRaw`SELECT COUNT(*) as total FROM "ResourceContent" cnt JOIN "Resource" r ON r.id = cnt."resourceId" WHERE r.status = 'PUBLISHED'`;
  console.log(`\nTotal fichiers PUBLISHED: ${total[0].total}`);
  
  // Total files with NULL
  const nulls = await p.$queryRaw`SELECT COUNT(*) as total FROM "ResourceContent" cnt JOIN "Resource" r ON r.id = cnt."resourceId" WHERE r.status = 'PUBLISHED' AND (cnt."pageCount" IS NULL OR cnt."pageCount" = 0)`;
  console.log(`Fichiers avec pageCount NULL/0: ${nulls[0].total}`);
  
  // Total files
  const totalAll = await p.$queryRaw`SELECT COUNT(*) as total FROM "ResourceContent"`;
  console.log(`Total ResourceContent: ${totalAll[0].total}`);
  
  await p.$disconnect();
})();
