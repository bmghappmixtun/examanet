require('dotenv').config({ path: '/workspace/edutunisie/.env.local' });
const { PrismaClient } = require('/workspace/edutunisie/node_modules/@prisma/client');
const p = new PrismaClient({ log: ['error'] });
(async () => {
  const f = await p.$queryRaw`
    SELECT r."numericId", r.title, cnt."fullText", rm."keyInsights"
    FROM "Resource" r
    LEFT JOIN "ResourceContent" cnt ON cnt."resourceId" = r.id
    LEFT JOIN "ResourceMetadata" rm ON rm."resourceId" = r.id
    WHERE r."numericId" = 14311
  `;
  const file = f[0];
  console.log(`#${file.numericId}: ${file.title.substring(0, 80)}`);
  console.log(`Text length: ${file.fullText?.length || 0}`);
  console.log(`Current keyInsights (${file.keyInsights?.length || 0}):`);
  for (const ki of file.keyInsights || []) {
    console.log(`  • ${ki.substring(0, 100)}`);
  }
  console.log('\n=== First 2000 chars of text ===');
  console.log(file.fullText?.substring(0, 2000));
  await p.$disconnect();
})();
