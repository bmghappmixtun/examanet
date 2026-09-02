require('dotenv').config({ path: '/workspace/edutunisie/.env.local' });
const { PrismaClient } = require('/workspace/edutunisie/node_modules/@prisma/client');
const p = new PrismaClient({ log: ['error'] });
(async () => {
  try {
    const users = await p.user.findMany({
      where: { firstName: { contains: 'samar' } },
      select: { id: true, numericId: true, firstName: true, lastName: true, email: true },
    });
    console.log('=== Users with firstName containing "samar" ===');
    users.forEach(u => console.log(`  #${u.numericId}: ${u.firstName} ${u.lastName || '—'} - ${u.email}`));
    
    const users2 = await p.user.findMany({
      where: { lastName: { contains: 'laabidi' } },
      select: { id: true, numericId: true, firstName: true, lastName: true, email: true },
    });
    console.log('\n=== Users with lastName containing "laabidi" ===');
    users2.forEach(u => console.log(`  #${u.numericId}: ${u.firstName} ${u.lastName || '—'} - ${u.email}`));
  } catch (e) {
    console.error('Error:', e.message);
  }
  await p.$disconnect();
})();
