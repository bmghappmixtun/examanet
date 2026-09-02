require('dotenv').config({ path: '/workspace/edutunisie/.env.local' });
const { PrismaClient } = require('/workspace/edutunisie/node_modules/@prisma/client');
const fs = require('fs');
const p = new PrismaClient({ log: ['error'] });
(async () => {
  const files = await p.$queryRaw`SELECT r.id, r."numericId" as num, r."fileKey" as key FROM "Resource" r WHERE r."numericId" IN (93, 2354, 4972, 4973)`;
  fs.writeFileSync('/tmp/failed_files.json', JSON.stringify(files));
  console.error(`Wrote ${files.length}`);
  await p.$disconnect();
})();
