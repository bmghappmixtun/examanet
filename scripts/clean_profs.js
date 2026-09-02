/**
 * Prof cleanup (2026-08-09)
 * Set lastName='—' for profs with null lastName (imported without proper name)
 */
require('dotenv').config({ path: '/workspace/edutunisie/.env.local' });
const { PrismaClient } = require('/workspace/edutunisie/node_modules/@prisma/client');
const p = new PrismaClient({ log: ['error'] });
(async () => {
  const profs = await p.user.findMany({
    where: { lastName: null, role: 'TEACHER' },
    select: { id: true, firstName: true, lastName: true, email: true },
  });
  console.log(`Found ${profs.length} profs with null lastName`);
  
  let updated = 0;
  for (const prof of profs) {
    await p.user.update({
      where: { id: prof.id },
      data: { lastName: '—' },
    });
    updated++;
  }
  console.log(`Updated ${updated} profs to lastName='—'`);
  await p.$disconnect();
})();
