require('dotenv').config({ path: '/workspace/edutunisie/.env.local' });
const { PrismaClient } = require('/workspace/edutunisie/node_modules/@prisma/client');
const https = require('https');
const { PDFDocument } = require('/workspace/edutunisie/node_modules/pdf-lib');
const p = new PrismaClient({ log: ['error'] });
const TOKEN = process.env.INTERNAL_BULK_TOKEN || 'devmanet-bulk-2026';

function download(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'x-internal-token': TOKEN } }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        // Follow redirect
        return download(res.headers.location).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    });
  });
}

(async () => {
  // Test on 5 files
  const files = await p.$queryRaw`
    SELECT r."numericId", r."fileKey", cnt."pageCount" as old
    FROM "Resource" r
    JOIN "ResourceContent" cnt ON cnt."resourceId" = r.id
    WHERE r.status = 'PUBLISHED' AND cnt."pageCount" IS NULL
    LIMIT 5
  `;
  console.log(`Found ${files.length} test files`);
  for (const f of files) {
    try {
      const url = `https://examanet.com/api/blob-teacher/${f.fileKey}`;
      const start = Date.now();
      const buf = await download(url);
      const pdf = await PDFDocument.load(buf, { ignoreEncryption: true });
      const realCount = pdf.getPageCount();
      const elapsed = Date.now() - start;
      console.log(`  #${f.numericId}: old=${f.old}, real=${realCount}, ${elapsed}ms, ${(buf.length/1024).toFixed(0)}KB`);
    } catch (e) {
      console.log(`  #${f.numericId}: ERROR ${e.message}`);
    }
  }
  await p.$disconnect();
})();
