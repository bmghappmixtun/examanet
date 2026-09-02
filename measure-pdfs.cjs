const https = require('https');
const fs = require('fs');
const { URL } = require('url');

const cards = fs.readFileSync('/workspace/docs/devoirat/cards-raw.jsonl', 'utf8')
  .trim().split('\n').map(l => JSON.parse(l));

console.log(`Will measure ${cards.length} PDFs`);

function headSize(pdfUrl) {
  return new Promise(resolve => {
    const u = new URL(pdfUrl);
    const opts = {
      hostname: u.hostname,
      path: u.pathname + (u.search || ''),
      method: 'HEAD',
      headers: {
        'User-Agent': 'Mozilla/5.0',
      },
      timeout: 15000,
    };
    const req = https.request(opts, (res) => {
      let cl = res.headers['content-length'];
      resolve({ url: pdfUrl, size: cl ? parseInt(cl) : null });
    });
    req.on('error', e => resolve({ url: pdfUrl, size: null }));
    req.on('timeout', () => { req.destroy(); resolve({ url: pdfUrl, size: null }); });
    req.end();
  });
}

(async () => {
  const results = [];
  const concurrency = 30;
  let done = 0;
  
  for (let i = 0; i < cards.length; i += concurrency) {
    const chunk = cards.slice(i, i + concurrency);
    const chunkResults = await Promise.all(chunk.map(c => headSize(c.pdfUrl)));
    results.push(...chunkResults);
    done += chunk.length;
    if (i % 300 === 0 || done >= cards.length) {
      process.stdout.write(`Progress: ${done}/${cards.length}\n`);
    }
  }
  
  // Stats
  let total = 0;
  let known = 0;
  const sizes = [];
  results.forEach(r => {
    if (r.size) {
      total += r.size;
      known++;
      sizes.push(r.size);
    }
  });
  
  // Outliers
  sizes.sort((a, b) => b - a);
  
  console.log(`\n========== SIZE SUMMARY ==========`);
  console.log(`PDFs with known size: ${known}/${results.length}`);
  console.log(`Total bytes: ${(total / 1024 / 1024 / 1024).toFixed(2)} GB`);
  console.log(`Average PDF: ${(total / known / 1024 / 1024).toFixed(2)} MB`);
  console.log(`Median PDF: ${(sizes[sizes.length/2]/1024/1024).toFixed(2)} MB`);
  console.log(`Largest PDFs (top 10):`);
  sizes.slice(0, 10).forEach((s, i) => console.log(`  ${i+1}. ${(s/1024/1024).toFixed(2)} MB`));
  console.log(`Smallest PDFs (bottom 5):`);
  sizes.slice(-5).forEach(s => console.log(`  ${(s/1024).toFixed(0)} KB`));
  
  // Save
  fs.writeFileSync('/workspace/docs/devoirat/sizes.jsonl',
    results.map(r => JSON.stringify(r)).join('\n'));
  fs.writeFileSync('/workspace/docs/devoirat/volume-report.json', JSON.stringify({
    totalPdfs: cards.length,
    knownSizeCount: known,
    totalGB: +(total / 1024 / 1024 / 1024).toFixed(2),
    avgMB: +(total / known / 1024 / 1024).toFixed(2),
    medianMB: +(sizes[sizes.length/2]/1024/1024).toFixed(2),
    maxSizeMB: +(sizes[0]/1024/1024).toFixed(2),
    minSizeKB: +(sizes[sizes.length-1]/1024).toFixed(0),
  }, null, 2));
})();
