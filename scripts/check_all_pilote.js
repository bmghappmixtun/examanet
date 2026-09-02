require('dotenv').config({ path: '/workspace/edutunisie/.env.local' });
const { PrismaClient } = require('/workspace/edutunisie/node_modules/@prisma/client');
const p = new PrismaClient({ log: ['error'] });
(async () => {
  const files = await p.resource.findMany({
    where: { 
      schoolType: 'PILOTE',
      subject: { slug: 'francais' },
      status: 'PUBLISHED',
    },
    select: { 
      numericId: true, title: true,
      class: { select: { nameFr: true, level: { select: { slug: true } } } },
    },
    orderBy: { numericId: 'asc' },
  });
  console.log(`=== All ${files.length} FR PILOTE files ===`);
  files.forEach(f => {
    const level = f.class?.level?.slug || '?';
    console.log(`  #${f.numericId} [${level}]: ${f.title.substring(0, 90)}`);
  });
  
  await p.$disconnect();
})();
