require('dotenv').config({ path: '/workspace/edutunisie/.env.local' });
const { PrismaClient } = require('/workspace/edutunisie/node_modules/@prisma/client');
const p = new PrismaClient({ log: ['error'] });
(async () => {
  const files = await p.resource.findMany({
    where: { status: 'PUBLISHED', subject: { slug: 'francais' } },
    select: { 
      numericId: true, title: true, type: true, homeworkSubtype: true, homeworkNumber: true,
      metadata: { select: { generalSubject: true } },
      class: { select: { nameFr: true } },
      section: { select: { nameFr: true } },
      year: true, trimester: true,
    },
    take: 20,
  });
  console.log('=== Sample titles ===');
  files.forEach(f => {
    console.log(`#${f.numericId}: ${f.title}`);
    console.log(`  type=${f.type} hw=${f.homeworkSubtype} N°${f.homeworkNumber} gs=${f.metadata?.generalSubject}`);
    console.log(`  class=${f.class?.nameFr} section=${f.section?.nameFr} year=${f.year} trim=${f.trimester}`);
  });
  await p.$disconnect();
})();
