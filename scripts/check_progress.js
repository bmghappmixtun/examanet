require('dotenv').config({ path: '/workspace/edutunisie/.env.local' });
const { PrismaClient } = require('/workspace/edutunisie/node_modules/@prisma/client');
const p = new PrismaClient({ log: ['error'] });
(async () => {
  const total = await p.resource.count({ where: { subject: { slug: 'physique' }, status: 'PUBLISHED' } });
  const withNew = await p.resource.count({ 
    where: { 
      subject: { slug: 'physique' }, 
      status: 'PUBLISHED',
      OR: [
        { title: { contains: ' - Physique - 1ère année secondaire' } },
        { title: { contains: ' - Physique - 2ème année secondaire' } },
        { title: { contains: ' - Physique - 3ème année secondaire' } },
        { title: { contains: ' - Physique - 4ème année secondaire' } },
      ],
    } 
  });
  console.log(`Total: ${total}, With new format: ${withNew}`);
  await p.$disconnect();
})();
