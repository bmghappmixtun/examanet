/**
 * notify-modified-to-indexnow.mjs
 *
 * Submit all recently modified resources to IndexNow + Bing Webmaster.
 *
 * Strategy:
 * - Get all resources with updatedAt > 2026-07-01 (recent changes)
 * - Batch in 1K URL chunks (safe, well under 10K daily limit)
 * - Surface HTTP response for each batch
 */

import { PrismaClient } from '@prisma/client';
import { execSync } from 'node:child_process';

const p = new PrismaClient();
const SITE_URL = 'https://examanet.com';

const cutoff = new Date('2026-07-01');
const resources = await p.resource.findMany({
  where: { 
    status: 'PUBLISHED',
    updatedAt: { gte: cutoff }
  },
  select: { slug: true, updatedAt: true },
  orderBy: { updatedAt: 'desc' }
});

console.log(`Found ${resources.length} recently modified resources (since ${cutoff.toISOString().split('T')[0]})`);

if (resources.length === 0) {
  console.log('No resources to notify');
  await p.$disconnect();
  process.exit(0);
}

const urls = resources.map(r => `${SITE_URL}/ressources/${r.slug}`);

const BATCH_SIZE = 1000;
const batches = [];
for (let i = 0; i < urls.length; i += BATCH_SIZE) {
  batches.push(urls.slice(i, i + BATCH_SIZE));
}

console.log(`Split into ${batches.length} batches of max ${BATCH_SIZE} URLs each\n`);

let successCount = 0;
let failCount = 0;

for (let i = 0; i < batches.length; i++) {
  const batch = batches[i];
  const cmd = `node scripts/indexnow/notify.mjs ${batch.map(u => `'${u}'`).join(' ')}`;
  process.stdout.write(`Batch ${i + 1}/${batches.length} (${batch.length} URLs)... `);
  try {
    const output = execSync(cmd, { encoding: 'utf8' });
    // Look for HTTP 200 or error in output
    if (output.includes('HTTP 200') || output.includes('✅')) {
      console.log('✅ 200 OK');
      successCount++;
    } else {
      console.log('❌ Unexpected response:');
      console.log(output.split('\n').slice(0, 5).join('\n'));
      failCount++;
    }
  } catch (e) {
    console.log(`❌ FAILED: ${e.message.slice(0, 100)}`);
    failCount++;
  }
}

console.log(`\n=== Summary ===`);
console.log(`Batches: ${batches.length} (✅ ${successCount}, ❌ ${failCount})`);
console.log(`Total URLs notified to IndexNow: ${successCount * BATCH_SIZE} (approx)`);
console.log(`Engines: Bing, Yandex, Naver, Seznam, Yep — typically processed within minutes.`);
console.log(`\nNote: IndexNow does NOT include Google.`);
console.log(`Google relies on sitemap.xml (linked in robots.txt) + manual Search Console submission.`);

await p.$disconnect();
