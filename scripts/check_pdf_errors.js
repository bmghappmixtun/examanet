require('dotenv').config({ path: '/workspace/edutunisie/.env.local' });
const { PrismaClient } = require('/workspace/edutunisie/node_modules/@prisma/client');
const https = require('https');
const p = new PrismaClient({ log: ['error'] });
const TOKEN = process.env.INTERNAL_BULK_TOKEN || 'devmanet-bulk-2026';

function download(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'x-internal-token': TOKEN } }, (res) => {
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    }).on('error', reject);
  });
}

(async () => {
  const files = await p.$queryRaw`
    SELECT r."numericId", r."fileKey", cnt."pageCount" as old
    FROM "Resource" r
    JOIN "ResourceContent" cnt ON cnt."resourceId" = r.id
    WHERE r."numericId" IN (4973, 4972, 2354, 93)
  `;
  for (const f of files) {
    console.log(`\n=== #${f.numericId} (old=${f.old}) ===`);
    try {
      const url = `https://examanet.com/api/blob-teacher/${f.fileKey}`;
      const buf = await download(url);
      console.log(`  Size: ${(buf.length/1024).toFixed(1)}KB`);
      console.log(`  First 8 bytes: ${buf.slice(0, 8).toString('hex')}`);
      // Check if it's a JPEG, PNG, or PDF
      if (buf[0] === 0xFF && buf[1] === 0xD8) console.log('  Type: JPEG image');
      else if (buf[0] === 0x89 && buf[1] === 0x50) console.log('  Type: PNG image');
      else if (buf.slice(0,4).toString() === '%PDF') console.log('  Type: PDF');
      else console.log(`  Type: Unknown (${buf.slice(0, 20).toString('utf-8', 0, 20).replace(/[^\x20-\x7E]/g, '?')})`);
    } catch (e) {
      console.log(`  ERROR: ${e.message}`);
    }
  }
  await p.$disconnect();
})();
