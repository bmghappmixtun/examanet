require('dotenv').config({ path: '/workspace/edutunisie/.env.local' });
const { PrismaClient } = require('/workspace/edutunisie/node_modules/@prisma/client');
const fs = require('fs');
const p = new PrismaClient({ log: ['error'] });

(async () => {
  const results = JSON.parse(fs.readFileSync('/tmp/pagecount_results.json', 'utf-8'));
  console.log(`Loaded ${results.length} results`);
  
  let updated = 0, skipped = 0, failed = 0;
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.err || r.new === null) {
      skipped++;
      continue;
    }
    if (r.old === r.new) {
      skipped++;
      continue;
    }
    try {
      await p.resourceContent.update({
        where: { resourceId: r.id },
        data: { pageCount: r.new },
      });
      updated++;
      if (updated % 200 === 0) console.log(`  ${i}/${results.length} updated=${updated} skipped=${skipped} failed=${failed}`);
    } catch (e) {
      failed++;
      console.error(`  FAIL #${r.num}: ${e.message}`);
    }
  }
  console.log(`\nDone. updated=${updated} skipped=${skipped} failed=${failed}`);
  await p.$disconnect();
})();
