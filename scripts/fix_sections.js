require('dotenv').config({ path: '/workspace/edutunisie/.env.local' });
const { PrismaClient } = require('/workspace/edutunisie/node_modules/@prisma/client');
const p = new PrismaClient({ log: ['error'] });
(async () => {
  // Get the new section IDs
  const sections = await p.section.findMany();
  const sectionByName = new Map(sections.map(s => [s.nameFr, s]));
  
  // #4591: Lettres
  const id1 = 'cmr8gfkuu00kbwmh47ft3aifs';
  // Actually let me look up by numericId
  const f1 = await p.resource.findFirst({ where: { numericId: 4591 }, select: { id: true, section: { select: { nameFr: true } } } });
  if (f1.section?.nameFr !== 'Lettres') {
    const newSec = sectionByName.get('Lettres');
    await p.resource.update({ where: { id: f1.id }, data: { sectionId: newSec.id } });
    console.log(`#4591: section changed from ${f1.section?.nameFr || 'null'} → Lettres`);
  } else {
    console.log(`#4591: already Lettres ✓`);
  }
  
  // #7909: Sciences (no specific section for 3ème AS)
  // Actually, looking at the data, 3ème AS doesn't have a section in the curriculum
  // So setting to null might be more correct. But our schema requires sectionId (?)
  const f2 = await p.resource.findFirst({ where: { numericId: 7909 }, select: { id: true, section: { select: { nameFr: true } } } });
  if (f2.section?.nameFr !== 'Sciences') {
    const newSec = sectionByName.get('Sciences');
    if (newSec) {
      await p.resource.update({ where: { id: f2.id }, data: { sectionId: newSec.id } });
      console.log(`#7909: section changed from ${f2.section?.nameFr || 'null'} → Sciences`);
    }
  } else {
    console.log(`#7909: already Sciences ✓`);
  }
  
  await p.$disconnect();
})();
