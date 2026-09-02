require('dotenv').config({ path: '/workspace/edutunisie/.env.local' });
const fs = require('fs');
const https = require('https');
const { spawnSync } = require('child_process');
const TOKEN = process.env.INTERNAL_BULK_TOKEN || 'devmanet-bulk-2026';

const fileKey = 'teacher-library/cmqtcvnf80074m0vbxeftgpl0/imported/1782383287427-y0z33o61-cmqtcw.pdf';
const url = `https://examanet.com/api/blob-teacher/${fileKey}`;

https.get(url, { headers: { 'x-internal-token': TOKEN } }, (res) => {
  if (res.statusCode !== 200) { console.log('HTTP', res.statusCode); return; }
  const chunks = [];
  res.on('data', c => chunks.push(c));
  res.on('end', () => {
    const buf = Buffer.concat(chunks);
    fs.writeFileSync('/tmp/file_515.pdf', buf);
    console.log('Downloaded', buf.length, 'bytes');
    // Run the OCR pipeline
    const out = spawnSync('python3', ['/tmp/extract_pdf.py', '/tmp/file_515.pdf', '5000'], { encoding: 'utf-8', maxBuffer: 50*1024*1024 });
    console.log('=== Extract status:', out.status, '===');
    console.log(out.stdout?.substring(0, 3000) || 'NO OUTPUT');
  });
});
