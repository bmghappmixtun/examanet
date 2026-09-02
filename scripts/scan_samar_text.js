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

function extractText(pdfBuffer) {
  const tmpFile = `/tmp/samar_${Date.now()}_${Math.random().toString(36).slice(2)}.pdf`;
  fs.writeFileSync(tmpFile, pdfBuffer);
  try {
    const out = spawnSync('python3', ['/tmp/extract_pdf.py', tmpFile, '15000'], {
      encoding: 'utf-8', maxBuffer: 50 * 1024 * 1024,
    });
    if (out.status !== 0) return '';
    return out.stdout;
  } finally {
    try { fs.unlinkSync(tmpFile); } catch {}
  }
}

async function main() {
  // Get all FR files
  const files = await prisma.resource.findMany({
    where: {
      status: 'PUBLISHED',
      subject: { slug: 'francais' },
    },
    select: { 
      id: true, numericId: true, fileKey: true, title: true,
      class: { select: { nameFr: true, level: { select: { slug: true } } } },
      teacher: { select: { firstName: true, lastName: true, numericId: true } },
    },
  });
  console.log(`Scanning ${files.length} FR files for "Samar" or "Laabidi"...`);
  
  const matches = [];
  let done = 0;
  const startTime = Date.now();
  
  for (const f of files) {
    try {
      const buf = await downloadFile(f.fileKey);
      const text = extractText(buf);
      
      // Search for various forms of Samar / Laabidi
      const patterns = [
        /\bSamar\b/,
        /سمر/,
        /\bLaabidi\b/,
        /\bLaâbidi\b/,
        /العابدي/,
        /Laab[iı]d[iı]/,  // Laabidi or Laabıdı
      ];
      
      for (const p of patterns) {
        const m = text.match(p);
        if (m) {
          // Get context around the match
          const idx = m.index;
          const context = text.substring(Math.max(0, idx - 50), Math.min(text.length, idx + 100));
          matches.push({
            numericId: f.numericId,
            title: f.title,
            class: f.class?.nameFr,
            level: f.class?.level?.slug,
            currentTeacher: f.teacher,
            pattern: p.source,
            context: context.replace(/\n/g, ' '),
          });
          break; // one match per file
        }
      }
      
      done++;
      if (done % 20 === 0) {
        console.log(`  ${done}/${files.length} done...`);
      }
    } catch (e) {
      done++;
    }
  }
  
  // Save
  fs.writeFileSync('/tmp/samar_matches.json', JSON.stringify(matches, null, 2));
  
  console.log(`\n=== FOUND ${matches.length} files mentioning Samar/Laabidi ===`);
  matches.forEach(m => {
    console.log(`\n#${m.numericId} [${m.level}]: ${m.title.substring(0, 80)}`);
    console.log(`  Current teacher: ${m.currentTeacher?.firstName} ${m.currentTeacher?.lastName || '—'} (#${m.currentTeacher?.numericId})`);
    console.log(`  Pattern: ${m.pattern}`);
    console.log(`  Context: ${m.context}`);
  });
  
  console.log(`\nTotal time: ${((Date.now() - startTime) / 1000).toFixed(0)}s`);
  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
