require('dotenv').config({ path: '/workspace/edutunisie/.env.local' });
const { PrismaClient } = require('/workspace/edutunisie/node_modules/@prisma/client');
const p = new PrismaClient({ log: ['error'] });
(async () => {
  const files = await p.$queryRaw`SELECT r.id, r."numericId" as num, r."fileKey" as key, cnt."pageCount" as old FROM "Resource" r JOIN "ResourceContent" cnt ON cnt."resourceId" = r.id WHERE r.status = 'PUBLISHED'`;
  // Write to a separate file via require
  const fs = require('fs');
  fs.writeFileSync('/tmp/files.json', JSON.stringify(files));
  console.error(`Wrote ${files.length} files`);
  await p.$disconnect();
})();
