require('dotenv').config({ path: '/workspace/edutinisie/.env.local' });
require('dotenv').config({ path: '/workspace/edutunisie/.env.local' });
const { PrismaClient } = require('/workspace/edutunisie/node_modules/@prisma/client');
const p = new PrismaClient({ log: ['error'] });
(async () => {
  // Find Math subject
  const math = await p.subject.findMany({
    where: { slug: { contains: 'math' } },
    select: { id: true, slug: true, nameFr: true, nameAr: true },
  });
  console.log('=== Math subjects ===');
  console.log(JSON.stringify(math, null, 2));
  
  // Find 8ème année collège class
  const cls = await p.class.findMany({
    where: { OR: [
      { slug: { contains: '8eme' } },
      { nameFr: { contains: '8ème' } },
      { nameFr: { contains: '8e' } },
    ] },
    include: { level: true },
  });
  console.log('\n=== 8ème classes ===');
  console.log(JSON.stringify(cls, null, 2));
  
  await p.$disconnect();
})();
