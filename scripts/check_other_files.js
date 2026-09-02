require('dotenv').config({ path: '/workspace/edutunisie/.env.local' });
const { PrismaClient } = require('/workspace/edutunisie/node_modules/@prisma/client');
const p = new PrismaClient({ log: ['error'] });
(async () => {
  // #14027 - assigned to Laâbidi Besma (#1520)
  const f1 = await p.resource.findFirst({
    where: { numericId: 14027 },
    select: { id: true, title: true, fileKey: true, teacher: { select: { firstName: true, lastName: true, email: true, schoolName: true } } },
  });
  console.log('=== #14027 (assigned to Laâbidi Besma) ===');
  console.log(`  Title: ${f1.title}`);
  console.log(`  Teacher: ${f1.teacher?.firstName} ${f1.teacher?.lastName} (${f1.teacher?.email})`);
  console.log(`  School: ${f1.teacher?.schoolName || '?'}`);
  
  // #3138 - assigned to TunisieCollège (#322)
  const f2 = await p.resource.findFirst({
    where: { numericId: 3138 },
    select: { id: true, title: true, fileKey: true, teacher: { select: { firstName: true, lastName: true, email: true, schoolName: true } } },
  });
  console.log('\n=== #3138 (assigned to TunisieCollège) ===');
  console.log(`  Title: ${f2.title}`);
  console.log(`  Teacher: ${f2.teacher?.firstName} ${f2.teacher?.lastName} (${f2.teacher?.email})`);
  console.log(`  School: ${f2.teacher?.schoolName || '?'}`);
  
  // Get the actual text from each
  const fs = require('fs');
  const https = require('https');
  const { spawnSync } = require('child_process');
  const INTERNAL_TOKEN = process.env.INTERNAL_BULK_TOKEN || 'devmanet-bulk-2026';
  
  async function downloadFile(fileKey) {
    const url = `https://examanet.com/api/blob-teacher/${fileKey}`;
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
  
  for (const f of [f1, f2]) {
    try {
      const buf = await downloadFile(f.fileKey);
      const tmp = '/tmp/check_other.pdf';
      fs.writeFileSync(tmp, buf);
      const out = spawnSync('python3', ['/tmp/extract_pdf.py', tmp, '3000'], { encoding: 'utf-8' });
      console.log(`\n=== #${f.numericId} header ===`);
      console.log(out.stdout.substring(0, 800));
    } catch (e) {
      console.log(`#${f.numericId} ERR: ${e.message}`);
    }
  }
  
  await p.$disconnect();
})();
