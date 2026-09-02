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
  const f = await prisma.resource.findFirst({
    where: { numericId: 7921 },
    select: { fileKey: true, title: true, schoolType: true, hasCorrection: true,
      class: { select: { nameFr: true } }, section: { select: { nameFr: true } },
      teacher: { select: { firstName: true, lastName: true } }
    },
  });
  console.log('Downloading #7921:', f.title);
  const buf = await downloadFile(f.fileKey);
  const tmpFile = '/tmp/test_audit.pdf';
  fs.writeFileSync(tmpFile, buf);
  const out = spawnSync('python3', ['/tmp/extract_pdf.py', tmpFile, '12000'], { encoding: 'utf-8' });
  const text = out.stdout;
  console.log('Text length:', text.length);
  console.log('--- First 2000 chars ---');
  console.log(text.substring(0, 2000));
  console.log('--- Last 500 chars ---');
  console.log(text.substring(text.length - 500));
  await prisma.$disconnect();
})();
