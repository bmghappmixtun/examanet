require('dotenv').config({ path: '/workspace/edutunisie/.env.local' });
const { PrismaClient } = require('/workspace/edutunisie/node_modules/@prisma/client');
const p = new PrismaClient({ log: ['error'] });
(async () => {
  // Total lycée by subject
  const files = await p.resource.findMany({
    where: { 
      status: 'PUBLISHED',
      class: { level: { slug: 'lycee' } },
    },
    select: { 
      id: true, subjectId: true,
      subject: { select: { slug: true, nameFr: true } },
    },
  });
  
  const bySubject = {};
  for (const f of files) {
    const s = f.subject.slug;
    if (!bySubject[s]) bySubject[s] = { name: f.subject.nameFr, count: 0, ids: [] };
    bySubject[s].count++;
    bySubject[s].ids.push(f.id);
  }
  
  const sorted = Object.entries(bySubject).sort((a, b) => b[1].count - a[1].count);
  console.log(`\n=== Total lycée files: ${files.length} ===`);
  console.log(`\nBy subject:`);
  for (const [slug, data] of sorted) {
    console.log(`  ${slug.padEnd(25)}: ${String(data.count).padStart(5)} files (${data.name})`);
  }
  
  await p.$disconnect();
})();
