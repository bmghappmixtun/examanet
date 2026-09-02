import { PrismaClient } from '@prisma/client';
const p = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL } }
});
const AR_SUBJECTS = ['arabe', 'philosophie', 'pensee-islamique', 'histoire', 'geographie', 'histoire-geographie'];
const byClass = {};
const resources = await p.resource.findMany({
  where: { subject: { slug: { in: AR_SUBJECTS } }, status: 'PUBLISHED' },
  include: { class: { select: { slug: true, nameFr: true } }, subject: { select: { slug: true } } },
});
for (const r of resources) {
  const c = r.class?.slug || 'null';
  byClass[c] = (byClass[c] || 0) + 1;
}
console.log('AR files by class:');
for (const [c, n] of Object.entries(byClass).sort((a,b)=>b[1]-a[1])) {
  console.log(`  ${c.padEnd(30)} : ${n}`);
}
await p.$disconnect();
