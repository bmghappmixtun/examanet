import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
const AR_SUBJECTS = ['arabe', 'philosophie', 'pensee-islamique', 'histoire', 'geographie', 'histoire-geographie'];
const resources = await p.resource.findMany({
  where: {
    subject: { slug: { in: AR_SUBJECTS } },
    status: 'PUBLISHED',
  },
  include: {
    subject: { select: { slug: true, nameFr: true, nameAr: true } },
    class: { select: { slug: true, nameFr: true, nameAr: true } },
    section: { select: { slug: true, nameFr: true, nameAr: true } },
  },
});
console.log(`Total AR lycée files: ${resources.length}`);
// Sample titles per subject
for (const subj of AR_SUBJECTS) {
  const sub = resources.filter(r => r.subject.slug === subj);
  console.log(`\n=== ${subj} (${sub.length}) ===`);
  console.log('Sample titles:');
  for (const r of sub.slice(0, 3)) {
    console.log(`  - ${r.title}`);
    console.log(`    class=${r.class?.slug}, section=${r.section?.slug || 'null'} (${r.section?.nameFr || '?'} | ${r.section?.nameAr || '?'})`);
  }
}
await p.$disconnect();
