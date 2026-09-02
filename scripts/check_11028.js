require('dotenv').config({ path: '/workspace/edutunisie/.env.local' });
const { PrismaClient } = require('/workspace/edutunisie/node_modules/@prisma/client');
const p = new PrismaClient({ log: ['error'] });
(async () => {
  const f = await p.$queryRaw`
    SELECT r."numericId", r.title, rm."keyInsights", rm."modelUsed"
    FROM "Resource" r
    JOIN "ResourceMetadata" rm ON rm."resourceId" = r.id
    WHERE r."numericId" = 11028
  `;
  if (f[0]) {
    console.log(`#${f[0].numericId}: ${f[0].title.substring(0, 60)}`);
    console.log(`Model: ${f[0].modelUsed}`);
    console.log(`\nKey insights (${f[0].keyInsights?.length || 0}):`);
    for (const ki of (f[0].keyInsights || []).slice(0, 5)) {
      console.log(`  • ${ki.substring(0, 100)}`);
    }
  } else {
    console.log('No metadata for #11028');
  }
  await p.$disconnect();
})();
