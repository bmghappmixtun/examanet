require('dotenv').config({ path: '/workspace/edutunisie/.env.local' });
const { PrismaClient } = require('/workspace/edutunisie/node_modules/@prisma/client');
const p = new PrismaClient({ log: ['error'] });
(async () => {
  const sections = await p.section.findMany({
    select: { id: true, slug: true, nameFr: true },
  });
  console.log('=== All sections ===');
  sections.forEach(s => console.log(`  ${s.slug.padEnd(35)} → "${s.nameFr}"`));
  await p.$disconnect();
})();
