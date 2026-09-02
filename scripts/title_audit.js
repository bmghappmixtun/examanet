require('dotenv').config({ path: '/workspace/edutunisie/.env.local' });
const { PrismaClient } = require('/workspace/edutunisie/node_modules/@prisma/client');
const p = new PrismaClient({ log: ['error'] });
(async () => {
  // Get all FR lycée files (already have AI metadata)
  const files = await p.resource.findMany({
    where: { 
      status: 'PUBLISHED', 
      subject: { slug: 'francais' },
      class: { level: { slug: 'lycee' } },
    },
    select: { 
      id: true, numericId: true, title: true, type: true, 
      homeworkSubtype: true, homeworkNumber: true,
      year: true, trimester: true, schoolType: true,
      class: { select: { nameFr: true, slug: true } },
      section: { select: { nameFr: true, slug: true } },
      metadata: { select: { generalSubject: true } },
    },
  });
  console.log(`Total: ${files.length} files`);
  
  // Count how many have the new format (end with ": <GeneralSubject>")
  const withGS = files.filter(f => /:\s+[^:]+$/.test(f.title));
  const withoutGS = files.filter(f => !/:\s+[^:]+$/.test(f.title));
  console.log(`  With new format (ends with : GS): ${withGS.length}`);
  console.log(`  Without GS suffix: ${withoutGS.length}`);
  
  // Show some that need rebuild
  console.log(`\n=== Need rebuild (first 10) ===`);
  withoutGS.slice(0, 10).forEach(f => {
    console.log(`  #${f.numericId}: ${f.title.substring(0, 100)}`);
    console.log(`    → Would be: ...: ${f.metadata?.generalSubject}`);
  });
  
  await p.$disconnect();
})();
