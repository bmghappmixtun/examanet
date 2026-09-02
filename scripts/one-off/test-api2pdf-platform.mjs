/**
 * API2PDF Test: Convert 5 real platform PDFs
 * Tests PDF → PDF (LibreOffice round-trip) and PDF → HTML → DOCX
 */
import { readFile, writeFile, stat } from 'fs/promises';
import { join } from 'path';

const API_KEY = '7071847a-1197-4a5f-bc17-d7f5e9e7c37b';
const PDF_DIR = '/workspace/docs/api2pdf-platform-test/pdfs';
const ORIGINAL_DIR = '/workspace/docs/api2pdf-platform-test/originals';

const files = [
  '1-anglais-9eme',
  '2-technologie-ventilateur',
  '3-scratch-cahier-activites',
  '4-technologie-alarme',
  '5-scratch-cours',
];

const githubBase = 'https://raw.githubusercontent.com/bmghappmixtun/edutunisie/tests/api2pdf/tests/api2pdf-platform-test/originals';

console.log('=== Test 1: PDF → PDF via LibreOffice (any-to-pdf) ===\n');
const results1 = [];
for (const name of files) {
  const url = `${githubBase}/${name}.pdf`;
  const startTime = Date.now();
  const r = await fetch('https://v2.api2pdf.com/libreoffice/any-to-pdf', {
    method: 'POST',
    headers: { 'Authorization': API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });
  const elapsed = Date.now() - startTime;
  const t = await r.text();
  let parsed = null;
  try { parsed = JSON.parse(t); } catch {}
  
  if (parsed?.Success && parsed?.FileUrl) {
    const pdfPath = join(PDF_DIR, `${name}-reconverted.pdf`);
    const pdfRes = await fetch(parsed.FileUrl);
    const pdfBuffer = Buffer.from(await pdfRes.arrayBuffer());
    await writeFile(pdfPath, pdfBuffer);
    results1.push({
      name,
      originalSizeKB: Math.round((await stat(join(ORIGINAL_DIR, `${name}.pdf`))).size / 1024),
      reconvertedSizeKB: Math.round(pdfBuffer.length / 1024),
      elapsedMs: elapsed,
      cost: parsed.Cost,
      pdfUrl: parsed.FileUrl,
      success: true,
    });
    console.log(`✓ ${name}: ${Math.round(pdfBuffer.length/1024)} KB output, ${elapsed}ms, $${parsed.Cost.toFixed(6)}`);
  } else {
    console.log(`✗ ${name}: ${parsed?.Error?.slice(0, 100) || 'unknown'}`);
    results1.push({ name, success: false, error: parsed?.Error });
  }
}

console.log('\n=== Test 2: PDF → HTML (pdf-to-html) ===\n');
const results2 = [];
for (const name of files) {
  const url = `${githubBase}/${name}.pdf`;
  const startTime = Date.now();
  const r = await fetch('https://v2.api2pdf.com/libreoffice/pdf-to-html', {
    method: 'POST',
    headers: { 'Authorization': API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });
  const elapsed = Date.now() - startTime;
  const t = await r.text();
  let parsed = null;
  try { parsed = JSON.parse(t); } catch {}
  
  if (parsed?.Success && parsed?.FileUrl) {
    const htmlRes = await fetch(parsed.FileUrl);
    const htmlContent = await htmlRes.text();
    const htmlPath = join(PDF_DIR, `${name}.html`);
    await writeFile(htmlPath, htmlContent);
    results2.push({
      name,
      htmlSizeKB: Math.round(htmlContent.length / 1024),
      elapsedMs: elapsed,
      cost: parsed.Cost,
      htmlUrl: parsed.FileUrl,
      success: true,
    });
    console.log(`✓ ${name}: ${Math.round(htmlContent.length/1024)} KB HTML, ${elapsed}ms, $${parsed.Cost.toFixed(6)}`);
  } else {
    console.log(`✗ ${name}: ${parsed?.Error?.slice(0, 100) || 'unknown'}`);
    results2.push({ name, success: false, error: parsed?.Error });
  }
}

console.log('\n=== Summary ===');
const ok1 = results1.filter(r => r.success).length;
const ok2 = results2.filter(r => r.success).length;
const totalCost1 = results1.reduce((s, r) => s + (r.cost || 0), 0);
const totalCost2 = results2.reduce((s, r) => s + (r.cost || 0), 0);
const totalCost = totalCost1 + totalCost2;

console.log(`\nTest 1 (PDF→PDF): ${ok1}/${results1.length} successful, $${totalCost1.toFixed(6)}`);
console.log(`Test 2 (PDF→HTML): ${ok2}/${results2.length} successful, $${totalCost2.toFixed(6)}`);
console.log(`Total: $${totalCost.toFixed(6)}`);

await writeFile('/tmp/api2pdf-platform-results.json', JSON.stringify({ test1: results1, test2: results2 }, null, 2));
console.log('\nResults saved to /tmp/api2pdf-platform-results.json');
