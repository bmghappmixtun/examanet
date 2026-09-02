require('dotenv').config({ path: '/workspace/edutunisie/.env.local' });
const { PrismaClient } = require('/workspace/edutunisie/node_modules/@prisma/client');
const p = new PrismaClient({ log: ['error'] });
(async () => {
  const cols = await p.$queryRaw`
    SELECT column_name, data_type FROM information_schema.columns 
    WHERE table_name = 'ResourceContent' ORDER BY ordinal_position
  `;
  for (const c of cols) {
    console.log(`  ${c.column_name} (${c.data_type})`);
  }
  await p.$disconnect();
})();
