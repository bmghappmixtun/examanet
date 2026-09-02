require('dotenv').config({ path: '/workspace/edutunisie/.env.local' });
const { PrismaClient } = require('/workspace/edutunisie/node_modules/@prisma/client');
const p = new PrismaClient({ log: ['error'] });
(async () => {
  const prof = await p.user.findFirst({
    where: { numericId: 1637 },
  });
  console.log('=== BEFORE ===');
  console.log(`#${prof.numericId}: ${prof.firstName} ${prof.lastName} (${prof.email})`);
  console.log(`  firstNameAr: ${prof.firstNameAr}`);
  console.log(`  lastNameAr: ${prof.lastNameAr}`);
  console.log(`  schoolName: ${prof.schoolName}`);
  
  // Update the prof
  const updated = await p.user.update({
    where: { id: prof.id },
    data: {
      firstName: 'Samar',  // Capitalize properly
      lastName: 'Laabidi',
      firstNameAr: 'سمر',
      lastNameAr: 'العابدي',
      // Try to find a real email if possible
      email: prof.email.replace('samar.Unknown', 'samar.laabidi'),
    },
  });
  console.log('\n=== AFTER ===');
  console.log(`#${updated.numericId}: ${updated.firstName} ${updated.lastName}`);
  console.log(`  firstNameAr: ${updated.firstNameAr}`);
  console.log(`  lastNameAr: ${updated.lastNameAr}`);
  console.log(`  email: ${updated.email}`);
  
  // Find all files
  const files = await p.resource.findMany({
    where: { teacherId: prof.id, status: 'PUBLISHED' },
    select: { 
      id: true, numericId: true, title: true, slug: true, type: true,
      subject: { select: { slug: true, nameFr: true } },
      class: { select: { nameFr: true, slug: true } },
      section: { select: { nameFr: true } },
      year: true, trimester: true,
    },
    orderBy: { numericId: 'asc' },
  });
  console.log(`\n=== ${files.length} files from this prof ===`);
  files.forEach(f => {
    console.log(`  #${f.numericId}: ${f.title.substring(0, 90)}`);
    console.log(`    ${f.subject?.slug} | ${f.class?.slug} | ${f.section?.nameFr || '-'} | ${f.year}`);
  });
  
  await p.$disconnect();
})();
