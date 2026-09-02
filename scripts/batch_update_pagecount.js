require('dotenv').config({ path: '/workspace/edutunisie/.env.local' });
const { PrismaClient } = require('/workspace/edutunisie/node_modules/@prisma/client');
const fs = require('fs');
const p = new PrismaClient({ log: ['error'] });

(async () => {
  const results = JSON.parse(fs.readFileSync('/tmp/pagecount_resource_v2_results.json', 'utf-8'));
  const toUpdate = results.filter(r => !r.err && r.new !== null && r.old !== r.new);
  console.log(`To update: ${toUpdate.length}`);
  
  // Use raw SQL batch update via CASE WHEN
  // Or use updateMany with id list (one at a time is too slow)
  // Best: split into chunks of 100 and do Promise.all
  
  const BATCH = 100;
  let success = 0, failed = 0;
  for (let i = 0; i < toUpdate.length; i += BATCH) {
    const batch = toUpdate.slice(i, i + BATCH);
    try {
      await Promise.all(batch.map(r => 
        p.resource.update({
          where: { id: r.id },
          data: { pageCount: r.new },
        }).catch(e => { failed++; return null; })
      ));
      success += batch.length;
    } catch (e) {
      console.error(`Batch ${i} error: ${e.message}`);
    }
    if (i % 1000 === 0) console.log(`  ${i}/${toUpdate.length} success=${success} failed=${failed}`);
  }
  console.log(`Done. success=${success} failed=${failed}`);
  await p.$disconnect();
})();
