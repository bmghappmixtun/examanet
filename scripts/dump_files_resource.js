require('dotenv').config({ path: '/workspace/edutunisie/.env.local' });
const { PrismaClient } = require('/workspace/edutunisie/node_modules/@prisma/client');
const fs = require('fs');
const p = new PrismaClient({ log: ['error'] });
(async () => {
  // Now read from Resource.pageCount (the UI one)
  const files = await p.$queryRaw`SELECT r.id, r."numericId" as num, r."fileKey" as key, r."pageCount" as old FROM "Resource" r WHERE r.status = 'PUBLISHED'`;
  fs.writeFileSync('/tmp/files_resource.json', JSON.stringify(files));
  console.error(`Wrote ${files.length} files`);
  await p.$disconnect();
})();
