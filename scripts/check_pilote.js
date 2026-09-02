require('dotenv').config({ path: '/workspace/edutunisie/.env.local' });
const { PrismaClient } = require('/workspace/edutunisie/node_modules/@prisma/client');
const p = new PrismaClient({ log: ['error'] });
(async () => {
  const ids = [4842, 7958, 14018];
  const files = await p.resource.findMany({
    where: { numericId: { in: ids } },
    select: { 
      numericId: true, title: true, schoolType: true,
      teacher: { select: { firstName: true, lastName: true, schoolName: true } },
      class: { select: { nameFr: true } },
      section: { select: { nameFr: true } },
    },
  });
  console.log('=== 3 PILOTE files ===');
  files.forEach(f => {
    console.log(`\n#${f.numericId} (schoolType=${f.schoolType}):`);
    console.log(`  Title: ${f.title}`);
    console.log(`  Teacher: ${f.teacher?.firstName} ${f.teacher?.lastName}`);
    console.log(`  School: ${f.teacher?.schoolName || '?'}`);
    console.log(`  Class: ${f.class?.nameFr} | Section: ${f.section?.nameFr || '?'}`);
  });
  
  // Also check ALL PILOTE files
  const allPilote = await p.resource.findMany({
    where: { schoolType: 'PILOTE', status: 'PUBLISHED' },
    select: { numericId: true, title: true, subject: { select: { slug: true } } },
  });
  console.log(`\n=== ALL ${allPilote.length} PILOTE files in DB ===`);
  const bySubj = {};
  allPilote.forEach(f => {
    const s = f.subject.slug;
    if (!bySubj[s]) bySubj[s] = [];
    bySubj[s].push(f);
  });
  Object.entries(bySubj).forEach(([s, list]) => {
    console.log(`  ${s}: ${list.length} files`);
  });
  
  await p.$disconnect();
})();
