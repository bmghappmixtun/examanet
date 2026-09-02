import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { setTimeout } from 'timers/promises';

const SEED_TOKEN = 'cffa7e495ff6a441d253b03b8cf1efa7';

function loConvert(inputPath, outputDir) {
  return new Promise((resolve, reject) => {
    const proc = spawn('soffice', ['--headless', '--convert-to', 'pdf', '--outdir', outputDir, inputPath]);
    let out = '';
    proc.stderr.on('data', d => out += d.toString());
    proc.on('close', code => {
      const base = path.basename(inputPath, path.extname(inputPath));
      const final = path.join(outputDir, base + '.pdf');
      if (fs.existsSync(final)) resolve(final);
      else reject(new Error('Convert failed: ' + out));
    });
  });
}

async function importApi(pdfBuffer, origBuffer, origName, origFmt, metadata) {
  const FormData = (await import('form-data')).default;
  const fd = new FormData();
  fd.append('file', pdfBuffer, 'document.pdf');
  if (origBuffer && origFmt) fd.append('originalFile', origBuffer, origName);
  fd.append('metadata', JSON.stringify(metadata));
  const r = await fetch('https://examanet.com/api/admin/tunisiecollege-import', {
    method: 'POST',
    headers: { 'x-seed-token': SEED_TOKEN, ...fd.getHeaders() },
    body: fd.getBuffer()
  });
  return r.json();
}

const SUBJECT = { math: 'mathematiques', maths: 'mathematiques', mathematiques: 'mathematiques', physique: 'physique', technologie: 'technologie' };
const CLASS = { bac: '4eme-secondaire', '1ère as': '1ere-secondaire', '1ere as': '1ere-secondaire', '1ère': '1ere-secondaire', '2ème': '2eme-secondaire', '3ème': '3eme-secondaire' };

(async () => {
  const files = JSON.parse(fs.readFileSync('/workspace/docs/devoirat/pilot/15-test-files.json', 'utf8'));
  const tmpDir = '/workspace/docs/devoirat/pilot/15-files';
  
  const results = [];
  
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    const idx = String(i + 1).padStart(2, '0');
    const start = Date.now();
    
    try {
      const ext = f.fileName.split('.').pop();
      
      // Find the corresponding converted PDF
      const safeName = f.fileName.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/\.(docx|doc)$/, '');
      const pdfPath = `${tmpDir}/${idx}_${safeName}.pdf`;
      
      let pdfBuffer;
      if (fs.existsSync(pdfPath)) {
        pdfBuffer = fs.readFileSync(pdfPath);
      } else {
        // Need to find original docx and convert
        const originalDocx = `${tmpDir}/${idx}_${safeName}.docx`;
        if (!fs.existsSync(originalDocx)) {
          // Try the version with spaces (the original download)
          const altName = f.fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
          const altDocx = `${tmpDir}/${idx}_${altName}.docx`;
          if (fs.existsSync(altDocx)) {
            console.log(`Converting alt: ${altDocx}`);
            await loConvert(altDocx, tmpDir);
            pdfBuffer = fs.readFileSync(pdfPath);
          } else {
            throw new Error(`No original or PDF for ${idx}`);
          }
        } else {
          console.log(`Converting: ${originalDocx}`);
          await loConvert(originalDocx, tmpDir);
          pdfBuffer = fs.readFileSync(pdfPath);
        }
      }
      
      // Find original Word (for upload as originalFile)
      let originalBuffer = null;
      let originalFilename = null;
      let originalFormat = null;
      
      // Try several naming variants
      const candidates = [
        `${tmpDir}/${idx}_${safeName}.docx`,
        `${tmpDir}/${idx}_${safeName}.doc`,
        `${tmpDir}/${idx}_${f.fileName.replace(/[^a-zA-Z0-9._-]/g, '_')}.docx`,
        `${tmpDir}/${idx}_${f.fileName.replace(/[^a-zA-Z0-9._-]/g, '_')}.doc`,
      ];
      for (const c of candidates) {
        if (fs.existsSync(c)) {
          originalBuffer = fs.readFileSync(c);
          originalFilename = path.basename(c);
          originalFormat = path.extname(c).slice(1);
          break;
        }
      }
      
      const subjectSlug = SUBJECT[f.subject.toLowerCase()] || 'mathematiques';
      const classSlug = CLASS[f.classe.toLowerCase()] || '1ere-secondaire';
      
      const metadata = {
        fileId: 'lo-test-' + idx + '-' + f.subId.slice(0, 8) + '-' + Date.now(),
        teacherName: f.profName,
        originalFormat,
        parsed: {
          title: f.fileName.replace(/\.(docx|doc)$/, '').replace(/[_-]/g, ' ').substring(0, 80),
          type: 'HOMEWORK',
          subjectSlug,
          classSlug,
          trimester: '1',
          year: f.year || '2024-2025',
          homeworkSubtype: 'CONTROLE',
          homeworkNumber: 1,
          schoolType: 'LYCEE',
          hasCorrection: false,
          language: 'fr',
        },
      };
      
      const result = await importApi(pdfBuffer, originalBuffer, originalFilename, originalFormat, metadata);
      const elapsed = ((Date.now() - start)/1000).toFixed(1);
      
      if (result.success) {
        console.log(`${idx}. [${f.subject.padEnd(11)}] ${f.profName.padEnd(28)} ✓ ${elapsed}s`);
        console.log(`     PDF:      ${result.fileUrl}`);
        if (result.originalFileUrl) {
          console.log(`     Original: ${result.originalFileUrl}`);
        }
        results.push({
          idx, ...f,
          success: true,
          publicPdfUrl: result.fileUrl,
          originalUrl: result.originalFileUrl,
          teacherId: result.teacherId,
          resourceId: result.resourceId,
          pdfSize: pdfBuffer.length,
          originalSize: originalBuffer?.length,
          elapsed,
        });
      } else {
        console.log(`${idx}. ✗ ${result.error}`);
        results.push({ idx, ...f, success: false, error: result.error });
      }
      
      await setTimeout(200);
    } catch (e) {
      console.log(`${idx}. ERROR: ${e.message}`);
      results.push({ idx, ...f, success: false, error: e.message });
    }
  }
  
  const success = results.filter(r => r.success).length;
  console.log(`\n=== RESULTS: ${success}/15 success ===`);
  fs.writeFileSync('/workspace/docs/devoirat/pilot/15-results.json', JSON.stringify(results, null, 2));
})();
