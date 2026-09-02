require('dotenv').config({ path: '/workspace/edutunisie/.env.local' });
const { PrismaClient } = require('/workspace/edutunisie/node_modules/@prisma/client');
const p = new PrismaClient({ log: ['error'] });
(async () => {
  // Count by role
  const all = await p.user.findMany({
    where: { lastName: null },
    select: { role: true },
  });
  const byRole = {};
  all.forEach(u => { byRole[u.role] = (byRole[u.role] || 0) + 1; });
  console.log('Null lastName by role:', byRole);
  console.log('Total:', all.length);
  
  // Only update TEACHER
  const r = await p.user.updateMany({
    where: { lastName: null, role: 'TEACHER' },
    data: { lastName: '—' },
  });
  console.log(`Updated ${r.count} TEACHERs`);
  
  // Remaining
  const remaining = await p.user.count({ where: { lastName: null, role: 'TEACHER' } });
  console.log('Remaining TEACHERs with null lastName:', remaining);
  
  await p.$disconnect();
})();
