require('dotenv').config({ path: '/workspace/edutunisie/.env.local' });
const { PrismaClient } = require('/workspace/edutunisie/node_modules/@prisma/client');
const fs = require('fs');
const https = require('https');
const { spawnSync } = require('child_process');

const prisma = new PrismaClient({ log: ['error'] });
const PROXY_URL = 'https://examanet.com/api/blob-teacher';
const INTERNAL_TOKEN = process.env.INTERNAL_BULK_TOKEN || 'devmanet-bulk-2026';

async function downloadFile(fileKey) {
  const url = `${PROXY_URL}/${fileKey}`;
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'x-internal-token': INTERNAL_TOKEN } }, (res) => {
      if (res.statusCode !== 200) { reject(new Error(`HTTP ${res.statusCode}`)); return; }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    });
    req.on('error', reject);
    req.setTimeout(60000, () => req.destroy(new Error('timeout')));
  });
}

(async () => {
  const ids = [4591, 7909, 7939, 7948, 7954, 7958, 14039, 15358];
  for (const id of ids) {
    const f = await prisma.resource.findFirst({
      where: { numericId: id },
      select: { fileKey: true, title: true, section: { select: { nameFr: true } } },
    });
    try {
      const buf = await downloadFile(f.fileKey);
      fs.writeFileSync('/tmp/header.pdf', buf);
      const out = spawnSync('python3', ['/tmp/extract_pdf.py', '/tmp/header.pdf', '3000'], { encoding: 'utf-8' });
      const text = out.stdout;
      // Print first 800 chars (header)
      console.log(`\n=== #${id} ===`);
      console.log(`Title: ${f.title.substring(0, 100)}`);
      console.log(`DB section: ${f.section?.nameFr}`);
      console.log('Header (first 800 chars):');
      console.log(text.substring(0, 800));
    } catch (e) {
      console.log(`#${id} ERR: ${e.message}`);
    }
  }
  await prisma.$disconnect();
})();
