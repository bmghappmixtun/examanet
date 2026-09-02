require('dotenv').config({ path: '/workspace/edutunisie/.env.local' });
const { PrismaClient } = require('/workspace/edutunisie/node_modules/@prisma/client');
const p = new PrismaClient({ log: ['error'] });
(async () => {
  // Find prof samar by numericId 1637
  const prof = await p.user.findFirst({
    where: { numericId: 1637 },
    select: { id: true, numericId: true, firstName: true, lastName: true, email: true, firstNameAr: true, lastNameAr: true, schoolName: true },
  });
  console.log('=== Prof #1637 BEFORE ===');
  console.log(JSON.stringify(prof, null, 2));
  
  // Find all files from this prof
  const files = await p.resource.findMany({
    where: { teacherId: prof.id, status: 'PUBLISHED' },
    select: { 
      id: true, numericId: true, title: true, slug: true, type: true,
      subject: { select: { slug: true, nameFr: true } },
      class: { select: { slug: true, nameFr: true } },
      section: { select: { nameFr: true } },
      year: true, trimester: true,
      fileSize: true, pageCount: true,
    },
    orderBy: { numericId: 'asc' },
  });
  console.log(`\n=== ${files.length} files from this prof ===`);
  for (const f of files) {
    console.log(`  #${f.numericId}: ${f.title.substring(0, 90)}`);
    console.log(`    subject=${f.subject?.slug} class=${f.class?.slug} section=${f.section?.nameFr || 'none'} year=${f.year}`);
  }
  
  // Check if any similar profs exist (might be dupes)
  const similarProfs = await p.user.findMany({
    where: { 
      OR: [
        { firstName: { contains: 'samar', mode: 'insensitive' } },
        { firstName: { contains: 'laabidi', mode: 'insensitive' } },
        { lastName: { contains: 'laabidi', mode: 'insensitive' } },
        { firstName: { contains: 'samar', mode: 'insensitive' } },
      ],
    },
    select: { id: true, numericId: true, firstName: true, lastName: true, email: true, _count: { select: { resourcesAsTeacher: true } } },
  });
  console.log(`\n=== Similar profs (samar, laabidi) ===`);
  similarProfs.forEach(pr => {
    console.log(`  #${pr.numericId}: ${pr.firstName} ${pr.lastName || '—'} (${pr._count.resourcesAsTeacher} files) - ${pr.email}`);
  });
  
  await p.$disconnect();
})();
