require('dotenv').config({ path: '/workspace/edutunisie/.env.local' });
const { PrismaClient } = require('/workspace/edutunisie/node_modules/@prisma/client');
const p = new PrismaClient({ log: ['error'] });
(async () => {
  const besma = await p.user.findFirst({
    where: { numericId: 1520 },
    select: { id: true, numericId: true, firstName: true, lastName: true, email: true, firstNameAr: true, lastNameAr: true, schoolName: true },
  });
  console.log('=== Prof #1520 (Laâbidi Besma) ===');
  console.log(JSON.stringify(besma, null, 2));

  const files = await p.resource.findMany({
    where: { teacherId: besma.id, status: 'PUBLISHED' },
    select: { numericId: true, title: true },
    orderBy: { numericId: 'asc' },
  });
  console.log(`\n${files.length} files for Besma Laabidi (#1520):`);
  files.forEach(f => console.log(`  #${f.numericId}: ${f.title.substring(0, 80)}`));

  const f3138 = await p.resource.findFirst({
    where: { numericId: 3138 },
    select: { id: true, title: true, slug: true, fileKey: true,
      subject: { select: { slug: true } },
      class: { select: { nameFr: true } },
    },
  });
  console.log(`\n=== #3138 full info ===`);
  console.log(JSON.stringify(f3138, null, 2));

  await p.$disconnect();
})();
