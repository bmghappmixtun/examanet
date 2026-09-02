require('dotenv').config({ path: '/workspace/edutunisie/.env.local' });
const { PrismaClient } = require('/workspace/edutunisie/node_modules/@prisma/client');
const p = new PrismaClient({ log: ['error'] });
(async () => {
  const prof = await p.user.findFirst({ where: { numericId: 1199 } });
  const profId = prof.id;
  
  const files = await p.$queryRaw`
    SELECT r."numericId", r.title, rm."modelUsed",
      array_length(rm."keyInsights", 1) as ki_count,
      rm."generalSubject"
    FROM "Resource" r
    LEFT JOIN "ResourceMetadata" rm ON rm."resourceId" = r.id
    WHERE r."teacherId" = ${profId}
    ORDER BY r."numericId" ASC
  `;
  console.log(`=== Prof 1199 - ${files.length} files ===`);
  let total = 0;
  for (const f of files) {
    total += f.ki_count || 0;
    console.log(`  #${f.numericId} [${f.modelUsed?.substring(0, 20)}] kI=${f.ki_count || 0} GS="${f.generalSubject?.substring(0, 50)}": ${f.title.substring(0, 60)}`);
  }
  console.log(`\nTotal exercises: ${total}`);
  await p.$disconnect();
})();
