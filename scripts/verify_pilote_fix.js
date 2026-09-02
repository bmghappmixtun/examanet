require('dotenv').config({ path: '/workspace/edutunisie/.env.local' });
const { PrismaClient } = require('/workspace/edutunisie/node_modules/@prisma/client');
const p = new PrismaClient({ log: ['error'] });
(async () => {
  const files = await p.resource.findMany({
    where: { numericId: { in: [4842, 7958, 14018] } },
    select: { numericId: true, title: true, schoolType: true },
  });
  files.forEach(f => {
    console.log(`#${f.numericId} [${f.schoolType}]:`);
    console.log(`  ${f.title}`);
  });
  await p.$disconnect();
})();
