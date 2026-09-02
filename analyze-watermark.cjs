const fs = require('fs');
const pdf = require('pdf-parse');

const samples = fs.readdirSync('/workspace/docs/devoirat/pilot/watermark-samples')
  .filter(f => f.endsWith('.pdf'))
  .sort();

const watermarkPatterns = [
  { name: 'devoirat.net', regex: /devoirat\.net/i },
  { name: 'tunisiecollege.net', regex: /tunisiecollege/i },
  { name: 'blogspot', regex: /blogspot/i },
  { name: 'wordpress', regex: /wordpress/i },
  { name: '9raya', regex: /9raya/i },
  { name: 'WebDoo', regex: /webdoo/i },
  { name: 'College pilote', regex: /coll[eè]ge\s*pilote/i },
  { name: 'Lycée pilote', regex: /lyc[eé]e\s*pilote/i },
  { name: 'Bac.tn', regex: /bac\.tn/i },
  { name: 'tunisia', regex: /tunisia/i },
  { name: 'PDF-XChange', regex: /pdf-xchange/i },
  { name: 'Sample watermark', regex: /sample\s*(watermark|demo)/i },
];

(async () => {
  console.log('=== WATERMARK DETECTION ANALYSIS ===\n');
  const results = [];
  
  for (const sample of samples) {
    const path = `/workspace/docs/devoirat/pilot/watermark-samples/${sample}`;
    const buffer = fs.readFileSync(path);
    
    let text = '';
    try {
      const data = await pdf(buffer);
      text = data.text;
    } catch (e) {
      console.log(`${sample}: parse error - ${e.message}`);
      continue;
    }
    
    const wmFound = watermarkPatterns
      .filter(p => p.regex.test(text))
      .map(p => p.name);
    
    // Also look for footer/header indicators (e.g., text repeated at top/bottom)
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    const lastLines = lines.slice(-3).join(' ');
    const firstLines = lines.slice(0, 3).join(' ');
    
    results.push({
      sample,
      sizeKB: (buffer.length/1024).toFixed(0),
      pages: text.split(/\f/g).length,
      totalLines: lines.length,
      wmFound,
      firstLines: firstLines.substring(0, 100),
      lastLines: lastLines.substring(0, 100),
    });
  }
  
  // Print results
  results.forEach(r => {
    console.log(`${r.sample} (${r.sizeKB} KB, ${r.pages} pages):`);
    if (r.wmFound.length > 0) {
      console.log(`   ⚠️  WATERMARK FOUND: ${r.wmFound.join(', ')}`);
    } else {
      console.log(`   ✓ No obvious watermark text`);
    }
    console.log(`   First lines: ${r.firstLines.substring(0, 80)}`);
    console.log(`   Last lines: ${r.lastLines.substring(0, 80)}`);
    console.log();
  });
  
  // Summary
  const withWatermark = results.filter(r => r.wmFound.length > 0);
  console.log(`\n========== SUMMARY ==========`);
  console.log(`Total PDFs tested: ${results.length}`);
  console.log(`With detected watermark: ${withWatermark.length} (${(withWatermark.length/results.length*100).toFixed(0)}%)`);
  console.log(`Clean: ${results.length - withWatermark.length} (${((results.length - withWatermark.length)/results.length*100).toFixed(0)}%)`);
  
  fs.writeFileSync('/workspace/docs/devoirat/pilot/watermark-analysis.json', JSON.stringify(results, null, 2));
})();
