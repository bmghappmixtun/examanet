const fs = require('fs');
const https = require('https');
const http = require('http');
const { URL } = require('url');

function download(url, depth = 0) {
  return new Promise((resolve, reject) => {
    if (depth > 5) return reject(new Error('redirects'));
    const u = new URL(url);
    const lib = u.protocol === 'https:' ? https : http;
    const req = lib.request({ 
      hostname: u.hostname, 
      path: u.pathname + (u.search || ''), 
      method: 'GET', 
      headers: { 'User-Agent': 'Mozilla/5.0' }
    }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400) {
        const target = res.headers.location?.startsWith('http') 
          ? res.headers.location 
          : `${u.protocol}//${u.host}${res.headers.location}`;
        return resolve(download(target, depth + 1));
      }
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    });
    req.on('error', reject);
    req.end();
  });
}

(async () => {
  const selected = JSON.parse(fs.readFileSync('/workspace/docs/devoirat/pilot/watermark-test-list.json', 'utf8'));
  
  console.log('Downloading 10 Jimdo PDFs for watermark test...\n');
  
  for (let i = 0; i < selected.length; i++) {
    const s = selected[i];
    const idx = String(i + 1).padStart(2, '0');
    const filename = `sample${idx}.pdf`;
    const outPath = `/workspace/docs/devoirat/pilot/watermark-samples/${filename}`;
    
    try {
      const buffer = await download(s.pdf.pdfUrl);
      fs.writeFileSync(outPath, buffer);
      
      // Quick text content check for watermark detection
      // PDFs may have embedded text streams
      const text = buffer.toString('binary');
      const hasDevoirat = /devoirat\.net/i.test(text);
      const hasTunisieCollege = /tunisiecollege/i.test(text);
      const hasBlogspot = /blogspot/i.test(text);
      const hasWordPress = /wordpress/i.test(text);
      const has9raya = /9raya/i.test(text);
      const hasImprimerie = /imprimerie|print/i.test(text);
      const hasExamen = /examen/i.test(text);
      
      console.log(`${idx}. ${(buffer.length/1024).toFixed(0)} KB | ${s.prof}`);
      console.log(`    Title: ${s.pdf.title.substring(0, 60)}`);
      console.log(`    Page URL: ${s.pdf.pageUrl}`);
      console.log(`    Saved: ${outPath}`);
      
      const wmList = [];
      if (hasDevoirat) wmList.push('devoirat.net');
      if (hasTunisieCollege) wmList.push('tunisiecollege');
      if (hasBlogspot) wmList.push('blogspot');
      if (hasWordPress) wmList.push('wordpress');
      if (has9raya) wmList.push('9raya');
      if (hasImprimerie) wmList.push('imprimerie');
      if (hasExamen) wmList.push('examen');
      
      if (wmList.length > 0) {
        console.log(`    ⚠️  Possible watermark: ${wmList.join(', ')}`);
      } else {
        console.log(`    ✓ No common watermark text detected`);
      }
      console.log();
    } catch (e) {
      console.log(`${idx}. FAILED: ${e.message}`);
    }
  }
})();
