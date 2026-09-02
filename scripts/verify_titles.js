require('dotenv').config({ path: '/workspace/edutunisie/.env.local' });
const { PrismaClient } = require('/workspace/edutunisie/node_modules/@prisma/client');
const p = new PrismaClient({ log: ['error'] });
(async () => {
  const files = await p.resource.findMany({
    where: { 
      status: 'PUBLISHED', 
      subject: { slug: 'francais' },
      class: { level: { slug: 'lycee' } },
    },
    select: { 
      numericId: true, title: true, type: true,
      class: { select: { slug: true } },
      section: { select: { nameFr: true } },
    },
    orderBy: { numericId: 'asc' },
    take: 10,
  });
  files.forEach(f => {
    console.log(`#${f.numericId}: ${f.title}`);
  });
  await p.$disconnect();
})();
