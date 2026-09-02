const https = require('https');
const fs = require('fs');
const { URL } = require('url');

// Read existing unique PDF URLs that we don't have size for
const sizes = fs.readFileSync('/workspace/docs/devoirat/sizes.jsonl', 'utf8')
  .trim().split('\n').map(l => JSON.parse(l));
const urlMap = new Map(sizes.map(s => [s.url, s.size]));

// Read cards to get all detail page URLs (need to re-fetch)
const cards = fs.readFileSync('/workspace/docs/devoirat/cards-raw.jsonl', 'utf8')
  .trim().split('\n').map(l => JSON.parse(l));

// Group cards by page URL (each detail page has multiple PDFs)
const pageMap = new Map();
for (const c of cards) {
  if (!pageMap.has(c.pageUrl)) pageMap.set(c.pageUrl, []);
  pageMap.get(c.pageUrl).push(c);
}

function get(url) {
  return new Promise(resolve => {
    const u = new URL(url);
    const opts = {
      hostname: u.hostname,
      path: u.pathname + (u.search || ''),
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'fr-FR,fr;q=0.9',
      },
      timeout: 15000,
    };
    const req = https.request(opts, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve(get(res.headers.location));
      }
      let body = '';
      res.on('data', c => body += c.toString('utf8'));
      res.on('end', () => resolve({ status: res.statusCode, body, url }));
    });
    req.on('error', e => resolve({ status: 0, body: '', url, error: e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, body: '', url, error: 'timeout' }); });
    req.end();
  });
}

function extractSizeMap(html) {
  // Find each j-downloadDocument block and match title+size
  const map = new Map(); // title → size
  const blocks = html.split(/<div id="cc-m-\d+" class="j-module n j-downloadDocument ">/);
  for (let i = 1; i < blocks.length; i++) {
    const b = blocks[i];
    const title = b.match(/<div class="cc-m-download-title">([^<]+)<\/div>/)?.[1]?.trim();
    const desc = b.match(/<div class="cc-m-download-description">([^<]+)<\/div>/)?.[1]?.trim();
    const sizeStr = b.match(/<span class="cc-m-download-file-size">([^<]+)<\/span>/)?.[1]?.trim();
    if (title) {
      const key = `${title}||${desc || ''}`;
      if (sizeStr) map.set(key, sizeStr);
    }
  }
  return map;
}

function parseSize(str) {
  if (!str) return null;
  const m = str.match(/([\d.]+)\s*(B|KB|MB|GB)/i);
  if (!m) return null;
  const v = parseFloat(m[1]);
  const u = m[2].toUpperCase();
  if (u === 'B') return v;
  if (u === 'KB') return v * 1024;
  if (u === 'MB') return v * 1024 * 1024;
  if (u === 'GB') return v * 1024 * 1024 * 1024;
  return null;
}

(async () => {
  const pageUrls = [...pageMap.keys()];
  console.log(`Re-fetching ${pageUrls.length} detail pages for sizes...`);
  
  // Build a global map of all PDFs with their sizes
  const sizeByKey = new Map(); // title||desc → size in bytes
  const concurrency = 10;
  let done = 0;
  
  for (let i = 0; i < pageUrls.length; i += concurrency) {
    const chunk = pageUrls.slice(i, i + concurrency);
    const results = await Promise.all(chunk.map(get));
    for (const r of results) {
      if (r.status !== 200) continue;
      const sizeMap = extractSizeMap(r.body);
      for (const [k, sizeStr] of sizeMap.entries()) {
        sizeByKey.set(k, parseSize(sizeStr));
      }
    }
    done += chunk.length;
    if (i % 30 === 0 || done >= pageUrls.length) {
      process.stdout.write(`Progress: ${done}/${pageUrls.length}\n`);
    }
  }
  
  // Now compute total size
  let totalFromHtml = 0;
  let matchedHtml = 0;
  const newSizes = [];
  for (const c of cards) {
    const key = `${c.title}||${c.description || ''}`;
    const size = sizeByKey.get(key);
    if (size) {
      totalFromHtml += size;
      matchedHtml++;
      newSizes.push({ url: c.pdfUrl, size });
    } else {
      newSizes.push({ url: c.pdfUrl, size: null });
    }
  }
  
  // Combine with previously known CDN sizes (use them when available)
  let total = 0;
  let known = 0;
  const finalSizes = newSizes.map(n => {
    if (n.size) { total += n.size; known++; return n; }
    // Try CDN URL lookup
    const prev = urlMap.get(n.url);
    if (prev && prev > 1000) {
      total += prev; known++;
      return { url: n.url, size: prev };
    }
    return n;
  });
  
  const sizesArr = finalSizes.map(s => s.size).filter(s => s && s > 1000);
  sizesArr.sort((a,b) => a-b);
  
  console.log(`\n========== SIZE SUMMARY ==========`);
  console.log(`PDFs from HTML: ${matchedHtml} (sum ${(totalFromHtml/1024/1024).toFixed(1)} MB)`);
  console.log(`PDFs total (combined): ${known}`);
  console.log(`Total GB: ${(total / 1024 / 1024 / 1024).toFixed(2)}`);
  console.log(`Total MB: ${(total / 1024 / 1024).toFixed(1)}`);
  console.log(`Avg KB: ${(total / known / 1024).toFixed(1)}`);
  console.log(`Min: ${(sizesArr[0]/1024).toFixed(1)} KB`);
  console.log(`Max: ${(sizesArr[sizesArr.length-1]/1024).toFixed(1)} KB`);
  console.log(`Median: ${(sizesArr[sizesArr.length/2]/1024).toFixed(1)} KB`);
  console.log(`p95: ${(sizesArr[Math.floor(sizesArr.length*0.95)]/1024).toFixed(1)} KB`);
  
  const buckets = { '<50KB': 0, '50-100KB': 0, '100-500KB': 0, '500KB-1MB': 0, '1-2MB': 0, '>2MB': 0 };
  sizesArr.forEach(s => {
    const kb = s/1024;
    if (kb < 50) buckets['<50KB']++;
    else if (kb < 100) buckets['50-100KB']++;
    else if (kb < 500) buckets['100-500KB']++;
    else if (kb < 1024) buckets['500KB-1MB']++;
    else if (kb < 2048) buckets['1-2MB']++;
    else buckets['>2MB']++;
  });
  console.log('\nDistribution:');
  Object.entries(buckets).forEach(([k, v]) => console.log(`  ${k}: ${v} PDFs`));
  
  fs.writeFileSync('/workspace/docs/devoirat/sizes-final.jsonl',
    finalSizes.map(s => JSON.stringify(s)).join('\n'));
  fs.writeFileSync('/workspace/docs/devoirat/volume-report.json', JSON.stringify({
    totalPdfs: 9069,
    knownSizeCount: known,
    totalGB: +(total / 1024 / 1024 / 1024).toFixed(2),
    totalMB: +(total / 1024 / 1024).toFixed(1),
    avgKB: +(total / known / 1024).toFixed(1),
    medianKB: +(sizesArr[sizesArr.length/2]/1024).toFixed(1),
    p95KB: +(sizesArr[Math.floor(sizesArr.length*0.95)]/1024).toFixed(1),
    maxKB: +(sizesArr[sizesArr.length-1]/1024).toFixed(1),
    minKB: +(sizesArr[0]/1024).toFixed(1),
    sizeDistribution: buckets,
  }, null, 2));
})();
