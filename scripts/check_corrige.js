require('dotenv').config({ path: '/workspace/edutunisie/.env.local' });
const { PrismaClient } = require('/workspace/edutunisie/node_modules/@prisma/client');
const p = new PrismaClient({ log: ['error'] });
(async () => {
  const files = await p.resource.findMany({
    where: { 
      status: 'PUBLISHED',
      subject: { slug: 'francais' },
      class: { level: { slug: 'lycee' } },
    },
    select: { id: true, numericId: true, title: true, hasCorrection: true, fileSize: true },
    orderBy: { numericId: 'asc' },
  });
  
  // Detect various corrigé patterns
  const patterns = [
    { name: 'Corrigé', regex: /Corrig[ée]/i },
    { name: 'correction', regex: /correction/i },
    { name: 'DC prefix', regex: /^DC\s/i },
    { name: 'avec Cor', regex: /avec\s+cor/i },
    { name: '(Corrigé)', regex: /\(Corrig[ée]\)/i },
  ];
  
  console.log('=== Detection patterns ===');
  for (const pat of patterns) {
    const matches = files.filter(f => pat.regex.test(f.title));
    console.log(`  ${pat.name}: ${matches.length} files`);
    matches.slice(0, 3).forEach(f => console.log(`    #${f.numericId}: ${f.title.substring(0, 80)}`));
  }
  
  // Now also check if there are files that LOOK like corrigés
  // (e.g., mention "corrigé" but hasCorrection=false)
  const likelyCorriges = files.filter(f => {
    if (f.hasCorrection) return false;
    return /Corrig[ée]/i.test(f.title) || /correction/i.test(f.title);
  });
  console.log(`\n=== Likely corrigés (mentioned in title but hasCorrection=false): ${likelyCorriges.length} ===`);
  
  // Check file size patterns for corrigés
  const fileSizes = files.map(f => f.fileSize).filter(s => s > 0).sort((a,b) => a-b);
  const median = fileSizes[Math.floor(fileSizes.length / 2)];
  console.log(`\n=== File size distribution ===`);
  console.log(`  Median: ${(median/1024).toFixed(0)} KB`);
  console.log(`  Files >500KB: ${files.filter(f => f.fileSize > 500000).length}`);
  console.log(`  Files >1MB: ${files.filter(f => f.fileSize > 1000000).length}`);
  
  await p.$disconnect();
})();
