require('dotenv').config({ path: '/workspace/edutunisie/.env.local' });
const { PrismaClient } = require('/workspace/edutunisie/node_modules/@prisma/client');
const p = new PrismaClient({ log: ['error'] });
(async () => {
  // Apply only to first 5 files
  const plan = require('/tmp/title_rebuilder_plan.json');
  const sample = plan.slice(0, 5);
  for (const u of sample) {
    console.log(`#${u.numericId}:`);
    console.log(`  OLD: ${u.oldTitle}`);
    console.log(`  NEW: ${u.newTitle}`);
    console.log(`  SLUG: ${u.newSlug}`);
    await p.resource.update({
      where: { id: u.id },
      data: { title: u.newTitle, slug: u.newSlug },
    });
  }
  console.log('\nDone with 5 test files');
  await p.$disconnect();
})();
