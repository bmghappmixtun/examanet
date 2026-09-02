require('dotenv').config({ path: '/workspace/edutunisie/.env.local' });
const { PrismaClient } = require('/workspace/edutunisie/node_modules/@prisma/client');
const https = require('https');
const p = new PrismaClient({ log: ['error'] });
const TOKEN = process.env.INTERNAL_BULK_TOKEN || 'devmanet-bulk-2026';

function download(url, timeout=15000) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'x-internal-token': TOKEN }, timeout }, (res) => {
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

(async () => {
  const files = await p.$queryRaw`
    SELECT r."numericId", r."fileKey", cnt."pageCount" as old
    FROM "Resource" r
    JOIN "ResourceContent" cnt ON cnt."resourceId" = r.id
    WHERE r."numericId" IN (93, 2354, 4972, 4973)
  `;
  for (const f of files) {
    console.log(`\n=== #${f.numericId} (old=${f.old}) ===`);
    try {
      const url = `https://examanet.com/api/blob-teacher/${f.fileKey}`;
      const buf = await download(url);
      console.log(`  Size: ${(buf.length/1024).toFixed(1)}KB, First 4 bytes: ${buf.slice(0, 4).toString()}`);
    } catch (e) {
      console.log(`  ERROR: ${e.message}`);
    }
  }
  await p.$disconnect();
})();
