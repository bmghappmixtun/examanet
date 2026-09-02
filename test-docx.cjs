const fs = require('fs');
const https = require('https');
const http = require('http');
const { URL } = require('url');

function download(url, depth = 0) {
  return new Promise((resolve, reject) => {
    if (depth > 5) return reject(new Error('redirects'));
    const u = new URL(url);
    const lib = u.protocol === 'https:' ? https : http;
    const req = lib.request({ hostname: u.hostname, path: u.pathname + (u.search || ''), method: 'GET', headers: { 'User-Agent': 'Mozilla/5.0' }}, res => {
      if (res.statusCode >= 300 && res.statusCode < 400) {
        const target = res.headers.location.startsWith('http') ? res.headers.location : `${u.protocol}//${u.host}${res.headers.location}`;
        return resolve(download(target, depth + 1));
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    });
    req.on('error', reject);
    req.end();
  });
}

(async () => {
  const pilot = JSON.parse(fs.readFileSync('/workspace/docs/devoirat/pilot/20-profs-files.json', 'utf8'));
  // Find first Word file from Chaabane Mounir (most words)
  const chaabane = pilot.find(p => p.profName.includes('Chaabane'));
  const firstWord = chaabane.files.find(f => f.ext === 'docx' || f.ext === 'doc');
  console.log(`Chaabane: ${chaabane.email}`);
  console.log(`File: ${firstWord.name} (.${firstWord.ext})`);
  
  const buffer = await download(firstWord.url);
  const ext = firstWord.ext;
  fs.writeFileSync(`/workspace/docs/devoirat/pilot/downloads/test.${ext}`, buffer);
  console.log(`Downloaded: ${buffer.length} bytes`);
  console.log(`First 2 bytes: ${buffer.slice(0, 2).toString('hex')} (PK=zip/docx, D0CF=doc)`);
})();
