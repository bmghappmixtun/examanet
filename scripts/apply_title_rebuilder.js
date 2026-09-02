require('dotenv').config({ path: '/workspace/edutunisie/.env.local' });
const { PrismaClient } = require('/workspace/edutunisie/node_modules/@prisma/client');
const p = new PrismaClient({ log: ['error'] });
(async () => {
  const plan = require('/tmp/title_rebuilder_plan.json');
  console.log(`Applying to ${plan.length} files...`);
  
  let success = 0, failed = 0, skipped = 0;
  for (let i = 0; i < plan.length; i++) {
    const u = plan[i];
    try {
      const cur = await p.resource.findUnique({ where: { id: u.id }, select: { title: true, slug: true } });
      if (cur.title === u.newTitle && cur.slug === u.newSlug) {
        skipped++;
        continue;
      }
      await p.resource.update({
        where: { id: u.id },
        data: { title: u.newTitle, slug: u.newSlug },
      });
      success++;
      if (success % 200 === 0) console.log(`  ${i}/${plan.length} (success=${success}, skipped=${skipped}, failed=${failed})`);
    } catch (e) {
      failed++;
      console.error(`  FAIL #${u.numericId}: ${e.message}`);
    }
  }
  console.log(`\nDone. success=${success}, skipped=${skipped}, failed=${failed}`);
  await p.$disconnect();
})();
