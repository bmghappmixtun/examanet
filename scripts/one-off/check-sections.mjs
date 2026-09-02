import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
const sections = await p.section.findMany({
  orderBy: { nameFr: 'asc' },
  select: { id: true, nameFr: true, slug: true, classId: true }
});
console.log('nameFr | slug | classId');
console.log('-------|------|--------');
for (const s of sections) console.log(`${s.nameFr} | ${s.slug} | ${s.classId}`);
await p.$disconnect();
