import { PrismaClient } from '@prisma/client';
const p = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL } }
});
const sections = await p.section.findMany({
  orderBy: { slug: 'asc' }
});
console.log('All sections:');
for (const s of sections) {
  console.log(`  ${s.slug.padEnd(30)} | ${s.nameFr.padEnd(30)} | ${s.nameAr || '(no AR)'}`);
}
// Also check distinct sections used in AR subjects
const AR_SUBJECTS = ['arabe', 'philosophie', 'pensee-islamique', 'histoire', 'geographie', 'histoire-geographie'];
const resources = await p.resource.findMany({
  where: { subject: { slug: { in: AR_SUBJECTS } }, status: 'PUBLISHED' },
  select: { section: { select: { slug: true, nameFr: true, nameAr: true } } },
});
const usedSections = {};
for (const r of resources) {
  const s = r.section?.slug || 'null';
  usedSections[s] = (usedSections[s] || 0) + 1;
}
console.log('\nSections used in AR subjects:');
for (const [s, c] of Object.entries(usedSections).sort((a,b)=>b[1]-a[1])) {
  console.log(`  ${s.padEnd(30)} : ${c}`);
}
await p.$disconnect();
