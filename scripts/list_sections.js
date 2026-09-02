require('dotenv').config({ path: '/workspace/edutunisie/.env.local' });
const { PrismaClient } = require('/workspace/edutunisie/node_modules/@prisma/client');
const p = new PrismaClient({ log: ['error'] });
(async () => {
  const sections = await p.section.findMany({ select: { id: true, nameFr: true, nameAr: true, slug: true } });
  console.log('=== All sections in DB ===');
  for (const s of sections) {
    console.log(`  ${s.id} | slug=${s.slug} | ${s.nameFr} / ${s.nameAr}`);
  }
  
  // Get count of files per section
  const counts = await p.$queryRaw`SELECT sec."nameFr" as name, COUNT(*) as count FROM "Resource" r LEFT JOIN "Section" sec ON r."sectionId" = sec.id WHERE r.status = 'PUBLISHED' GROUP BY sec."nameFr" ORDER BY count DESC`;
  console.log('\n=== Files per section ===');
  for (const c of counts) console.log(`  ${c.count} ${c.name || 'NULL'}`);
  
  await p.$disconnect();
})();
