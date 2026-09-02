require('dotenv').config({ path: '/workspace/edutunisie/.env.local' });
const { PrismaClient } = require('/workspace/edutunisie/node_modules/@prisma/client');
const p = new PrismaClient({ log: ['error'] });
(async () => {
  // #4591: was "Bac - Section Sciences Expérimentales" → "Bac - Section Lettres"
  // #7909: was "3ème AS - Section Mathématiques" → "3ème AS - Section Sciences"
  
  const f1 = await p.resource.findFirst({ where: { numericId: 4591 }, select: { id: true, title: true } });
  const f2 = await p.resource.findFirst({ where: { numericId: 7909 }, select: { id: true, title: true } });
  
  const newT1 = f1.title.replace('Section Sciences Expérimentales', 'Section Lettres');
  const newT2 = f2.title.replace('Section Mathématiques', 'Section Sciences');
  
  await p.resource.update({ where: { id: f1.id }, data: { title: newT1 } });
  console.log(`#4591 title: ${f1.title} → ${newT1}`);
  
  await p.resource.update({ where: { id: f2.id }, data: { title: newT2 } });
  console.log(`#7909 title: ${f2.title} → ${newT2}`);
  
  await p.$disconnect();
})();
