import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { setTimeout } from 'timers/promises';

const SEED_TOKEN = 'cffa7e495ff6a441d253b03b8cf1efa7';

function convertWithLibreOffice(inputPath, outputDir) {
  return new Promise((resolve, reject) => {
    const proc = spawn('soffice', [
      '--headless',
      '--convert-to', 'pdf',
      '--outdir', outputDir,
      inputPath
    ]);
    let output = '';
    proc.stdout.on('data', d => output += d.toString());
    proc.stderr.on('data', d => output += d.toString());
    proc.on('error', reject);
    proc.on('close', code => {
      const baseName = path.basename(inputPath, path.extname(inputPath));
      const finalPath = path.join(outputDir, baseName + '.pdf');
      if (fs.existsSync(finalPath)) {
        resolve(finalPath);
      } else {
        reject(new Error(`Convert failed (code ${code}): ${output}`));
      }
    });
  });
}

async function downloadFile(url, maxRedirects = 5) {
  let depth = 0;
  while (depth < maxRedirects) {
    const resp = await fetch(url, { redirect: 'manual', headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (resp.status >= 300 && resp.status < 400) {
      const loc = resp.headers.get('location');
      if (!loc) throw new Error('No location header');
      url = loc.startsWith('http') ? loc : new URL(loc, url).href;
      depth++;
    } else if (resp.ok) {
      return Buffer.from(await resp.arrayBuffer());
    } else {
      throw new Error(`HTTP ${resp.status}`);
    }
  }
  throw new Error('Too many redirects');
}

async function importToExamanet(pdfBuffer, originalBuffer, originalFilename, originalFormat, metadata) {
  const FormData = (await import('form-data')).default;
  const fd = new FormData();
  fd.append('file', pdfBuffer, 'document.pdf');
  if (originalBuffer && originalFormat) {
    fd.append('originalFile', originalBuffer, originalFilename);
  }
  fd.append('metadata', JSON.stringify(metadata));
  
  const r = await fetch('https://examanet.com/api/admin/tunisiecollege-import', {
    method: 'POST',
    headers: {
      'x-seed-token': SEED_TOKEN,
      ...fd.getHeaders(),
    },
    body: fd.getBuffer()
  });
  return r.json();
}

const SUBJECT_LOOKUP = {
  'math': 'mathematiques',
  'maths': 'mathematiques',
  'mathematiques': 'mathematiques',
  'physique': 'physique',
  'technologie': 'technologie',
};

const CLASS_LOOKUP = {
  'bac': '4eme-secondaire',
  '1ère as': '1ere-secondaire',
  '1ere as': '1ere-secondaire',
  '1ère': '1ere-secondaire',
  '2ème': '2eme-secondaire',
  '3ème': '3eme-secondaire',
};

(async () => {
  const files = JSON.parse(fs.readFileSync('/workspace/docs/devoirat/pilot/15-test-files.json', 'utf8'));
  
  const tmpDir = '/workspace/docs/devoirat/pilot/15-files';
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  
  console.log('=== BULK 15 FILES (Math/Phys/Tech Bac) ===');
  console.log('=== LibreOffice conversion ===\n');
  const results = [];
  
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    const idx = String(i + 1).padStart(2, '0');
    const startTime = Date.now();
    
    try {
      console.log(`\n${idx}. [${f.subject.padEnd(11)}] ${f.profName}`);
      console.log(`     File: ${f.fileName}`);
      
      // 1. Download original
      const ext = f.fileName.split('.').pop();
      const localPath = `${tmpDir}/${idx}_${f.fileName.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
      const originalBuffer = await downloadFile(f.fileUrl);
      fs.writeFileSync(localPath, originalBuffer);
      console.log(`     Downloaded: ${(originalBuffer.length/1024).toFixed(0)} KB`);
      
      // 2. Convert via LibreOffice
      const convertStart = Date.now();
      const pdfPath = await convertWithLibreOffice(localPath, tmpDir);
      const pdfBuffer = fs.readFileSync(pdfPath);
      const convertTime = ((Date.now() - convertStart)/1000).toFixed(1);
      console.log(`     LO Convert: ${(pdfBuffer.length/1024).toFixed(0)} KB (${convertTime}s)`);
      
      // 3. Get subject slug
      const subjectLower = f.subject.toLowerCase();
      const subjectSlug = SUBJECT_LOOKUP[subjectLower] || 'mathematiques';
      const classSlug = CLASS_LOOKUP[f.classe.toLowerCase()] || '1ere-secondaire';
      
      // 4. Build metadata
      const metadata = {
        fileId: 'lo-test-' + idx + '-' + f.subId.slice(0, 8) + '-' + Date.now(),
        teacherName: f.profName,
        originalFormat: f.isWord ? ext : null,
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
      
      // 5. Upload to Examanet
      const result = await importToExamanet(
        pdfBuffer,
        f.isWord ? originalBuffer : null,
        f.isWord ? f.fileName : null,
        f.isWord ? ext : null,
        metadata
      );
      
      const elapsed = ((Date.now() - startTime)/1000).toFixed(1);
      
      if (result.success) {
        console.log(`     ✓ Total ${elapsed}s`);
        console.log(`     PDF:     ${result.fileUrl}`);
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
          originalSize: originalBuffer.length,
          localPdfPath: pdfPath,
          localOriginalPath: localPath,
          elapsed,
        });
      } else {
        console.log(`     ✗ ${elapsed}s | ${result.error}`);
        results.push({ idx, ...f, success: false, error: result.error });
      }
      
      await setTimeout(200);
    } catch (e) {
      console.log(`     ✗ ERROR: ${e.message}`);
      results.push({ idx, ...f, success: false, error: e.message });
    }
  }
  
  // Summary
  const success = results.filter(r => r.success).length;
  const fail = results.filter(r => !r.success).length;
  console.log(`\n\n=== RESULTS: ${success}/${files.length} success (${fail} failed) ===`);
  
  fs.writeFileSync('/workspace/docs/devoirat/pilot/15-results.json', JSON.stringify(results, null, 2));
  console.log(`Saved results to pilot/15-results.json`);
})();
