require('dotenv').config({ path: '/workspace/edutinisie/.env.local' });
require('/workspace/edutunisie/node_modules/dotenv').config({ path: '/workspace/edutunisie/.env.local' });
const { PrismaClient } = require('/workspace/edutunisie/node_modules/@prisma/client');
const p = new PrismaClient({ log: ['error'] });
(async () => {
  const prof = await p.user.findFirst({ where: { numericId: 1637 } });
  // All files (any subject, any status)
  const files = await p.resource.findMany({
    where: { teacherId: prof.id },
    select: { 
      id: true, numericId: true, title: true, status: true, slug: true, type: true,
      subject: { select: { slug: true, nameFr: true } },
      class: { select: { nameFr: true, slug: true } },
      section: { select: { nameFr: true } },
      year: true, trimester: true,
    },
    orderBy: { numericId: 'asc' },
  });
  console.log(`=== ${files.length} files from Samar Laabidi (any status) ===`);
  files.forEach(f => {
    console.log(`  #${f.numericId} [${f.status}]: ${f.title.substring(0, 90)}`);
    console.log(`    ${f.subject?.slug} | ${f.class?.slug} | ${f.section?.nameFr || '-'} | ${f.year}`);
  });
  
  // Also check the OCR text from FR lycée audit - search for "Samar"
  // (we don't have raw text saved, just the headers)
  await p.$disconnect();
})();
