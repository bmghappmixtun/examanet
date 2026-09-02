require('dotenv').config({ path: '/workspace/edutunisie/.env.local' });
const { PrismaClient } = require('/workspace/edutunisie/node_modules/@prisma/client');
const p = new PrismaClient({ log: ['error'] });
(async () => {
  // Find all samar/laabidi variants
  const allUsers = await p.user.findMany({
    where: { 
      OR: [
        { firstName: { contains: 'samar' } },
        { firstName: { contains: 'laabidi' } },
        { lastName: { contains: 'laabidi' } },
      ],
    },
    select: { id: true, numericId: true, firstName: true, lastName: true, email: true, _count: { select: { resourcesAsTeacher: true } } },
  });
  console.log(`=== Found ${allUsers.length} similar profs ===`);
  allUsers.forEach(pr => {
    console.log(`  #${pr.numericId}: ${pr.firstName} ${pr.lastName || '—'} (${pr._count.resourcesAsTeacher} files) - ${pr.email}`);
  });
  await p.$disconnect();
})();
