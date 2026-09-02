require('dotenv').config({ path: '/workspace/edutunisie/.env.local' });
const { PrismaClient } = require('/workspace/edutunisie/node_modules/@prisma/client');
const p = new PrismaClient({ log: ['error'] });

async function main() {
  const dryRun = !process.argv.includes('--apply');
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'APPLY'}`);
  
  // The 3 PILOTE lycée files
  const files = await p.resource.findMany({
    where: {
      numericId: { in: [4842, 7958, 14018] },
      status: 'PUBLISHED',
    },
    select: { id: true, numericId: true, title: true, schoolType: true },
  });
  
  let updated = 0;
  for (const f of files) {
    let newTitle = f.title;
    
    // Add "Lycée pilote" after the type
    // Pattern: "{Type} - Français - {Class} - {Section} - Lycée pilote - ({year}) - {GS}"
    
    // For 1ère AS (no section)
    if (newTitle.includes('1ère AS')) {
      newTitle = newTitle.replace('1ère AS', '1ère AS - Lycée pilote');
    }
    // For Bac (with section)
    else if (newTitle.includes('Bac - Section')) {
      newTitle = newTitle.replace('Bac - Section', 'Bac Lycée pilote - Section');
    }
    // For Bac (without section)
    else if (newTitle.match(/\bBac\b/)) {
      newTitle = newTitle.replace(/\bBac\b/, 'Bac Lycée pilote');
    }
    
    if (newTitle !== f.title) {
      console.log(`\n#${f.numericId}:`);
      console.log(`  OLD: ${f.title}`);
      console.log(`  NEW: ${newTitle}`);
      if (!dryRun) {
        await p.resource.update({ where: { id: f.id }, data: { title: newTitle } });
      }
      updated++;
    }
  }
  console.log(`\n${updated} files would be updated`);
  if (dryRun) console.log('Run with --apply to commit');
  await p.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
