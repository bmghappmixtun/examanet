require('dotenv').config({ path: '/workspace/edutunisie/.env.local' });
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

(async () => {
  const buf = await downloadFile('teacher-library/cmr8w6x5g00l8stsgefzl51m3/imported/duty2-1783322567224-770-XzWhBtzSRI0r1uzHRy1QMUD3wdyM19.pdf');
  console.log('Downloaded:', buf.length, 'bytes');
  fs.writeFileSync('/tmp/debug_7921.pdf', buf);
  
  // Test with longer wait
  const out = spawnSync('python3', ['/tmp/extract_pdf.py', '/tmp/debug_7921.pdf', '12000'], {
    encoding: 'utf-8',
    maxBuffer: 100 * 1024 * 1024,
  });
  console.log('Status:', out.status);
  console.log('Stderr:', out.stderr);
  console.log('Stdout length:', out.stdout.length);
  console.log('First 500:', out.stdout.substring(0, 500));
})();
