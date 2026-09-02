require('dotenv').config({ path: '/workspace/edutunisie/.env.local' });
const { PrismaClient } = require('/workspace/edutunisie/node_modules/@prisma/client');
const https = require('https');
const { PDFDocument } = require('/workspace/edutunisie/node_modules/pdf-lib');
const p = new PrismaClient({ log: ['error'] });
const TOKEN = process.env.INTERNAL_BULK_TOKEN || 'devmanet-bulk-2026';

function download(url, timeout=30000) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'x-internal-token': TOKEN }, timeout }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return download(res.headers.location).then(resolve).catch(reject);
      }
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
  for (const numId of [93, 2354, 4972, 4973]) {
    const r = await p.$queryRaw`SELECT r.id, r."numericId", r."fileKey" FROM "Resource" r WHERE r."numericId" = ${numId}`;
    if (!r[0]) continue;
    console.log(`Trying #${numId}...`);
    try {
      const url = `https://examanet.com/api/blob-teacher/${r[0].fileKey}`;
      const buf = await download(url);
      if (buf.slice(0, 4).toString() === '%PDF') {
        const pdf = await PDFDocument.load(buf, { ignoreEncryption: true });
        const newCount = pdf.getPageCount();
        await p.resourceContent.update({ where: { resourceId: r[0].id }, data: { pageCount: newCount } });
        console.log(`  Updated to ${newCount}`);
      } else {
        console.log(`  Not a PDF, skipping (first bytes: ${buf.slice(0, 4).toString()})`);
      }
    } catch (e) {
      console.log(`  ERROR: ${e.message}`);
    }
  }
  await p.$disconnect();
})();
