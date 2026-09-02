import { readFile, writeFile, stat } from 'fs/promises';
import { join } from 'path';

const API_KEY = '7071847a-1197-4a5f-bc17-d7f5e9e7c37b';
const PDF_DIR = '/workspace/docs/api2pdf-platform-test/docx-converted';
const ORIGINAL_DIR = '/workspace/docs/api2pdf-platform-test/docx-originals';

const files = [
  'Ch.I.2_SADT12_13',
  'dt_3_2017',
  'DC2_fevrier_2020_correction2sc',
  'Oxillations_mecaniques_amortis',
  'filtrespass_bas_passif_electriques',
];

const githubBase = 'https://raw.githubusercontent.com/bmghappmixtun/edutunisie/tests/api2pdf/tests/api2pdf-platform-test-jotform/originals';

console.log('=== Test API2PDF on 5 real JotForm DOCX ===\n');
const results = [];
for (const name of files) {
  const url = `${githubBase}/${name}.docx`;
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
    const pdfPath = join(PDF_DIR, `${name}.pdf`);
    const pdfRes = await fetch(parsed.FileUrl);
    const pdfBuffer = Buffer.from(await pdfRes.arrayBuffer());
    await writeFile(pdfPath, pdfBuffer);
    const origSize = (await stat(join(ORIGINAL_DIR, `${name}.docx`))).size;
    results.push({
      name,
      docxSizeKB: Math.round(origSize / 1024),
      pdfSizeKB: Math.round(pdfBuffer.length / 1024),
      ratio: (pdfBuffer.length / origSize).toFixed(2),
      elapsedMs: elapsed,
      cost: parsed.Cost,
      pdfUrl: parsed.FileUrl,
      success: true,
    });
    console.log(`✓ ${name}`);
    console.log(`    ${Math.round(origSize/1024)} KB DOCX → ${Math.round(pdfBuffer.length/1024)} KB PDF (ratio ${(pdfBuffer.length/origSize).toFixed(2)}x)`);
    console.log(`    ${elapsed}ms, $${parsed.Cost.toFixed(6)}`);
  } else {
    console.log(`✗ ${name}: ${parsed?.Error?.slice(0, 200) || 'unknown'}`);
    results.push({ name, success: false, error: parsed?.Error });
  }
}

console.log('\n=== Summary ===');
const ok = results.filter(r => r.success).length;
const totalCost = results.reduce((s, r) => s + (r.cost || 0), 0);
const totalElapsed = results.reduce((s, r) => s + r.elapsedMs, 0);
const totalDocx = results.reduce((s, r) => s + (r.docxSizeKB || 0), 0);
const totalPdf = results.reduce((s, r) => s + (r.pdfSizeKB || 0), 0);
console.log(`${ok}/${results.length} successful`);
console.log(`DOCX total: ${totalDocx} KB → PDF total: ${totalPdf} KB`);
console.log(`Total cost: $${totalCost.toFixed(6)}`);
console.log(`Total time: ${totalElapsed}ms (avg ${Math.round(totalElapsed/results.length)}ms/file)`);

await writeFile('/tmp/api2pdf-jotform-results.json', JSON.stringify(results, null, 2));
