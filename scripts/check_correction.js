require('dotenv').config({ path: '/workspace/edutunisie/.env.local' });
const { PrismaClient } = require('/workspace/edutunisie/node_modules/@prisma/client');
const p = new PrismaClient({ log: ['error'] });
(async () => {
  // Get all FR files with hasCorrection info
  const files = await p.resource.findMany({
    where: { status: 'PUBLISHED', subject: { slug: 'francais' } },
    select: { 
      id: true, numericId: true, title: true, hasCorrection: true, 
      fileSize: true, pageCount: true, type: true,
    },
  });
  console.log(`\n=== All FR files (${files.length}) ===`);
  const with_corr = files.filter(f => f.hasCorrection);
  const without_corr = files.filter(f => !f.hasCorrection);
  console.log(`  hasCorrection=true: ${with_corr.length}`);
  console.log(`  hasCorrection=false: ${without_corr.length}`);
  
  // Patterns in titles of corrected files
  const corrPatterns = {};
  with_corr.forEach(f => {
    const m = f.title.match(/[Cc]orrig[ée]?/);
    if (m) {
      const key = m[0];
      corrPatterns[key] = (corrPatterns[key] || 0) + 1;
    }
  });
  console.log(`  Title patterns in corrected files:`, corrPatterns);
  
  // Sample 5 corrected files to see their titles
  console.log(`\nSample corrected files:`);
  with_corr.slice(0, 5).forEach(f => {
    console.log(`  #${f.numericId}: ${f.title.substring(0, 90)} (${f.fileSize} bytes)`);
  });
  
  console.log(`\nSample non-corrected files:`);
  without_corr.slice(0, 5).forEach(f => {
    console.log(`  #${f.numericId}: ${f.title.substring(0, 90)} (${f.fileSize} bytes)`);
  });
  
  // Also check DC pattern (Devoir Corrigé)
  const dc = files.filter(f => /^DC\s/i.test(f.title));
  console.log(`\nFiles starting with "DC": ${dc.length}`);
  dc.slice(0, 3).forEach(f => console.log(`  #${f.numericId}: ${f.title.substring(0, 80)}`));
  
  await p.$disconnect();
})();
