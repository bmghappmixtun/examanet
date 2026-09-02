import { PrismaClient } from '@prisma/client';
const p = new PrismaClient({
  datasources: {
    db: { url: process.env.DATABASE_URL }
  }
});
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
console.log(`Total AR files: ${resources.length}`);
const issues = [];
for (const r of resources) {
  // Check for French/English words (3+ chars)
  const m = r.title.match(/[a-zA-Z]{3,}/g);
  if (m) {
    const real = m.filter(s => !/^(N°|TIC|BDD|TD|TP|AB|ABC|ABCD|trim|Trim|TRIM|ABCDE)$/.test(s));
    if (real.length > 0) {
      issues.push({ id: r.id, slug: r.subject.slug, title: r.title, words: real });
    }
  }
}
console.log(`\nTitles with French/English words (${issues.length}):`);
// Group by subject
const bySubj = {};
for (const i of issues) {
  bySubj[i.slug] = bySubj[i.slug] || [];
  bySubj[i.slug].push(i);
}
for (const [s, list] of Object.entries(bySubj)) {
  console.log(`\n=== ${s} (${list.length}) ===`);
  for (const i of list) {
    console.log(`  #${i.id}: ${i.title}`);
    console.log(`     -> ${JSON.stringify(i.words)}`);
  }
}
await p.$disconnect();
