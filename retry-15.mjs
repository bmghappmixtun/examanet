import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';

const SEED_TOKEN = 'cffa7e495ff6a441d253b03b8cf1efa7';

function loConvertWithTimeout(inputPath, outputDir, timeoutMs = 45000) {
  return new Promise((resolve, reject) => {
    const proc = spawn('soffice', ['--headless', '--convert-to', 'pdf', '--outdir', outputDir, inputPath]);
    const timer = setTimeout(() => {
      proc.kill('SIGKILL');
      reject(new Error(`Convert timeout after ${timeoutMs}ms`));
    }, timeoutMs);
    let out = '';
    proc.stderr.on('data', d => out += d.toString());
    proc.on('close', code => {
      clearTimeout(timer);
      const base = path.basename(inputPath, path.extname(inputPath));
      const final = path.join(outputDir, base + '.pdf');
      if (fs.existsSync(final)) resolve(final);
      else reject(new Error('Convert failed: ' + out));
    });
  });
}

(async () => {
  const files = JSON.parse(fs.readFileSync('/workspace/docs/devoirat/pilot/15-test-files.json', 'utf8'));
  const file = files[14]; // file 15 (index 14)
  const idx = '15';
  const tmpDir = '/workspace/docs/devoirat/pilot/15-files';
  const docxPath = `${tmpDir}/15_DC1-2019-2020.docx`;
  
  console.log(`Retrying file 15: ${file.fileName}`);
  console.log(`File size: ${(fs.statSync(docxPath).size/1024).toFixed(0)} KB`);
  
  try {
    const pdfPath = await loConvertWithTimeout(docxPath, tmpDir, 60000); // 60s timeout
    console.log(`Converted: ${pdfPath}`);
    
    // Upload
    const FormData = (await import('form-data')).default;
    const originalBuffer = fs.readFileSync(docxPath);
    const pdfBuffer = fs.readFileSync(pdfPath);
    
    const metadata = {
      fileId: 'lo-test-15-retry-' + Date.now(),
      teacherName: file.profName,
      originalFormat: 'docx',
      parsed: {
        title: file.fileName.replace(/\.(docx|doc)$/, '').replace(/[_-]/g, ' ').substring(0, 80),
        type: 'HOMEWORK',
        subjectSlug: 'technologie',
        classSlug: '1ere-secondaire',
        trimester: '1',
        year: file.year || '2024-2025',
        homeworkSubtype: 'CONTROLE',
        homeworkNumber: 1,
        schoolType: 'LYCEE',
        hasCorrection: false,
        language: 'fr',
      },
    };
    
    const fd = new FormData();
    fd.append('file', pdfBuffer, 'document.pdf');
    fd.append('originalFile', originalBuffer, file.fileName);
    fd.append('metadata', JSON.stringify(metadata));
    
    const r = await fetch('https://examanet.com/api/admin/tunisiecollege-import', {
      method: 'POST',
      headers: { 'x-seed-token': SEED_TOKEN, ...fd.getHeaders() },
      body: fd.getBuffer()
    });
    const result = await r.json();
    console.log('Result:', JSON.stringify(result, null, 2));
    
    if (result.success) {
      // Update results.json
      const results = JSON.parse(fs.readFileSync('/workspace/docs/devoirat/pilot/15-results.json', 'utf8'));
      results.push({
        idx: '15', ...file,
        success: true,
        publicPdfUrl: result.fileUrl,
        originalUrl: result.originalFileUrl,
        teacherId: result.teacherId,
        resourceId: result.resourceId,
        pdfSize: pdfBuffer.length,
        originalSize: originalBuffer.length,
      });
      fs.writeFileSync('/workspace/docs/devoirat/pilot/15-results.json', JSON.stringify(results, null, 2));
      console.log('✓ File 15 added to results');
    }
  } catch (e) {
    console.log(`FAILED: ${e.message}`);
    console.log('File 15 will be skipped or processed later with different method');
  }
})();
