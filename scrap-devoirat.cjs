// Scrape all pages from devoirat.net sitemap in parallel
// Extract: PDFs + teacher names + classes
const fs = require('fs');
const https = require('https');
const { URL } = require('url');

const INPUT = '/tmp/dev-sitemap.xml';
const OUTPUT = '/workspace/docs/devoirat/cards-raw.jsonl';
const LOG = '/workspace/docs/devoirat/scrape.log';

const urls = fs.readFileSync(INPUT, 'utf8').match(/<loc>[^<]+<\/loc>/g)
  .map(l => l.replace(/<\/?loc>/g, '').trim())
  .filter(u => !u.endsWith('/sitemap.xml'));

console.log(`Total URLs to scrape: ${urls.length}`);

function get(url) {
  return new Promise((resolve) => {
    const u = new URL(url);
    const opts = {
      hostname: u.hostname,
      path: u.pathname + (u.search || ''),
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'fr-FR,fr;q=0.9',
      },
      timeout: 20000,
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

function extractCards(html, url) {
  const cards = [];
  // Each card: <div id="cc-m-XXX" class="j-module n j-downloadDocument ">
  const re = /class="cc-m-download-title">([^<]+)<\/div>\s*<div class="cc-m-download-description">([^<]+)<\/div>/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const title = m[1].trim();
    const desc = m[2].trim();
    // Find the matching href for this card
    const idMatch = html.substring(0, m.index).match(/<div[^>]*id="cc-m-(\d+)"[^>]*class="[^"]*j-downloadDocument[^"]*"/);
    let pdfUrl = null;
    if (idMatch) {
      const pdfHref = html.substring(m.index, m.index + 5000);
      const ph = pdfHref.match(/href="(\/app\/download\/\d+\/[^"]+\.pdf[^"]*)"/);
      if (ph) pdfUrl = 'https://www.devoirat.net' + ph[1].split('?')[0];
    }
    cards.push({ title, description: desc, pdfUrl, pageUrl: url });
  }
  return cards;
}

function extractTeacher(desc) {
  // Extract teacher name from "Mme Abdennadher" or "Mr Bouzouraa Anis" etc.
  const m = desc.match(/^(Mr|Mme|Mlle|Prof|Professeur|Mr\.|Mme\.)\s+(.+)/);
  if (!m) return null;
  return m[2].trim().replace(/\s+/g, ' ');
}

(async () => {
  const start = Date.now();
  fs.writeFileSync(LOG, '');
  const out = fs.openSync(OUTPUT, 'w');
  
  const concurrency = 10;
  let done = 0;
  let allCards = [];
  let allFiles = [];
  
  // Map URLs to detailed PDF pages only (not listing pages like /devoirs-maths/)
  const detailUrls = urls.filter(u => {
    const path = new URL(u).pathname;
    // Detail pages end with something like /1ère-année-1er-trimestre-contrôle-1/
    const segs = path.split('/').filter(Boolean);
    if (segs.length < 2) return false;
    // Skip listing/aggregator pages (root, /maths/, /devoirs-maths/, /examens-bac-tunisie, etc.)
    const lastSeg = segs[segs.length - 1];
    if (!lastSeg) return false;
    // Skip pure listing pages
    if (/^(devoirs|cours|séries|corrigés|examens)-[a-z\-]+$/.test(lastSeg)) return false;
    if (/^[a-zéè\-]+$/.test(lastSeg)) return false; // /maths/, /physique/, etc.
    if (lastSeg === 'rechercher' || lastSeg === 'sitemap' || lastSeg === 'blog' || lastSeg === 'contact') return false;
    return true;
  });
  
  console.log(`Detail URLs to scrape: ${detailUrls.length}`);
  fs.appendFileSync(LOG, `Detail URLs: ${detailUrls.length}\n`);
  
  // Process in chunks
  for (let i = 0; i < detailUrls.length; i += concurrency) {
    const chunk = detailUrls.slice(i, i + concurrency);
    const results = await Promise.all(chunk.map(get));
    for (const r of results) {
      done++;
      if (r.status !== 200) {
        fs.appendFileSync(LOG, `FAIL ${r.status} ${r.url}${r.error ? ' ('+r.error+')' : ''}\n`);
        continue;
      }
      const cards = extractCards(r.body, r.url);
      fs.appendFileSync(LOG, `OK ${cards.length} cards | ${r.url}\n`);
      allCards = allCards.concat(cards);
    }
    if (i % 50 === 0 || (i + concurrency) >= detailUrls.length) {
      process.stdout.write(`Progress: ${done}/${detailUrls.length} | Cards: ${allCards.length}\n`);
    }
  }
  
  // Dedupe by PDF URL
  const seen = new Set();
  allCards = allCards.filter(c => {
    if (!c.pdfUrl || seen.has(c.pdfUrl)) return false;
    seen.add(c.pdfUrl);
    fs.writeSync(out, JSON.stringify(c) + '\n');
    return true;
  });
  
  fs.closeSync(out);
  
  // Summary
  const teachers = new Map();
  const byClass = new Map();
  const byMatiere = new Map();
  
  for (const c of allCards) {
    const t = extractTeacher(c.description);
    if (t) teachers.set(t, (teachers.get(t) || 0) + 1);
    
    // Detect class from URL
    const u = new URL(c.pageUrl);
    const cls = u.pathname.match(/(1ère|2ème|3ème|4ème)-année/i)?.[0] || 'unknown';
    byClass.set(cls, (byClass.get(cls) || 0) + 1);
    
    // Matiere from URL
    const sub = ['allemand','anglais','arabe','espagnol','français','italien','maths','physique','sciences-svt','philosophie','informatique','technologie','économie-gestion','histoire-géographie'];
    for (const s of sub) {
      if (u.pathname.includes(s)) { byMatiere.set(s, (byMatiere.get(s) || 0) + 1); break; }
    }
  }
  
  console.log(`\n========== SUMMARY ==========`);
  console.log(`Total PDFs: ${allCards.length}`);
  console.log(`Unique teachers: ${teachers.size}`);
  console.log(`\nTop 20 teachers:`);
  [...teachers.entries()].sort((a,b) => b[1] - a[1]).slice(0, 20).forEach(([t, c]) => console.log(`  ${c.toString().padStart(4)} PDFs - ${t}`));
  
  console.log(`\nBy class:`);
  [...byClass.entries()].sort((a,b) => b[1] - a[1]).forEach(([k, v]) => console.log(`  ${v.toString().padStart(4)} - ${k}`));
  
  console.log(`\nBy matière:`);
  [...byMatiere.entries()].sort((a,b) => b[1] - a[1]).forEach(([k, v]) => console.log(`  ${v.toString().padStart(4)} - ${k}`));
  
  fs.writeFileSync('/workspace/docs/devoirat/summary.json', JSON.stringify({
    totalPdfs: allCards.length,
    uniqueTeachers: teachers.size,
    teacherCounts: Object.fromEntries([...teachers.entries()].sort((a,b) => b[1] - a[1])),
    byClass: Object.fromEntries([...byClass.entries()]),
    byMatiere: Object.fromEntries([...byMatiere.entries()]),
  }, null, 2));
})();
