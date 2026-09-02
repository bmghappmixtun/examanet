require('dotenv').config({ path: '/workspace/edutunisie/.env.local' });
const { PrismaClient } = require('/workspace/edutunisie/node_modules/@prisma/client');
const p = new PrismaClient({ log: ['error'] });
(async () => {
  // Use updateMany for speed
  const result = await p.user.updateMany({
    where: { lastName: null, role: 'TEACHER' },
    data: { lastName: '—' },
  });
  console.log(`Updated ${result.count} profs in one shot`);
  await p.$disconnect();
})();
