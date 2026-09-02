/**
 * notify-new-urls-indexnow.mjs
 *
 * Submit all resources to IndexNow with the new /ressources/{id}/{slug} URL format.
 */
import { PrismaClient } from '@prisma/client';
import { execSync } from 'node:child_process';

const p = new PrismaClient();
const SITE_URL = 'https://examanet.com';

const all = await p.resource.findMany({
  where: { status: 'PUBLISHED', numericId: { not: null } },
  select: { numericId: true, slug: true }
});

console.log(`Found ${all.length} resources to notify`);

const urls = all.map(r => `${SITE_URL}/ressources/${r.numericId}/${r.slug}`);
const BATCH_SIZE = 1000;
const batches = [];
for (let i = 0; i < urls.length; i += BATCH_SIZE) {
  batches.push(urls.slice(i, i + BATCH_SIZE));
}

let success = 0;
let fail = 0;
for (let i = 0; i < batches.length; i++) {
  const batch = batches[i];
  const cmd = `node scripts/indexnow/notify.mjs ${batch.map(u => `'${u}'`).join(' ')}`;
  process.stdout.write(`Batch ${i + 1}/${batches.length} (${batch.length} URLs)... `);
  try {
    const output = execSync(cmd, { encoding: 'utf8' });
    if (output.includes('HTTP 200') || output.includes('✅')) {
      console.log('✅');
      success++;
    } else {
      console.log('❌');
      fail++;
    }
  } catch (e) {
    console.log(`❌ ${e.message.slice(0, 60)}`);
    fail++;
  }
}

console.log(`\nBatches: ${batches.length} (✅ ${success}, ❌ ${fail})`);
console.log(`URLs: ${success * BATCH_SIZE}+`);

await p.$disconnect();
