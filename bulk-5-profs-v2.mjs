import fs from 'fs';
import { setTimeout } from 'timers/promises';

// iLovePDF client
const PUBLIC_KEY = 'project_public_d1448365692fd5dee0aa5e617dc877a3_oZ7Rs0e163492d3ce295974b66731db65ce9c';
const API_BASE = 'https://api.ilovepdf.com';
let ilpToken;

async function ilpAuth() {
  const r = await fetch(`${API_BASE}/v1/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ public_key: PUBLIC_KEY })
  });
  return (await r.json()).token;
}

async function ilpConvert(buffer, filename) {
  if (!ilpToken) ilpToken = await ilpAuth();
  const FormData = (await import('form-data')).default;
  
  const startR = await fetch(`${API_BASE}/v1/start/officepdf`, {
    headers: { 'Authorization': `Bearer ${ilpToken}` }
  });
  const start = await startR.json();
  
  const fd = new FormData();
  fd.append('task', start.task);
  fd.append('file', buffer, { filename });
  const upR = await fetch(`https://${start.server}/v1/upload`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${ilpToken}`, ...fd.getHeaders() },
    body: fd.getBuffer()
  });
  const up = await upR.json();
  
  await fetch(`https://${start.server}/v1/process`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${ilpToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      task: start.task,
      files: [{ server_filename: up.server_filename, filename }],
      tool: 'officepdf'
    })
  });
  
  const dlR = await fetch(`https://${start.server}/v1/download/${start.task}`, {
    headers: { 'Authorization': `Bearer ${ilpToken}` }
  });
  return Buffer.from(await dlR.arrayBuffer());
}

async function downloadFile(url) {
  const resp = await fetch(url, { redirect: 'follow', headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return Buffer.from(await resp.arrayBuffer());
}

const SEED_TOKEN = 'cffa7e495ff6a441d253b03b8cf1efa7';

// Teacher metadata for proper subject/class mapping
const TEACHER_LOOKUP = {
  'Ouerghi Chokri': { matiere: 'mathematiques', classe: '4eme-secondaire' },
  'Hammadi Med ALi': { matiere: 'physique', classe: '4eme-secondaire' },
  'HERMI NAOUFEL': { matiere: 'informatique', classe: '4eme-secondaire' },
  'Chagraoui Abdelfatteh': { matiere: 'mathematiques', classe: '1ere-secondaire' },
  'Dhahri Mondher': { matiere: 'physique', classe: '4eme-secondaire' },
};

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

async function processFile(file, prof) {
  const startTime = Date.now();
  const isWord = file.ext === 'doc' || file.ext === 'docx';
  const fname = file.name;
  
  try {
    // 1. Download original (always)
    const originalBuffer = await downloadFile(file.url);
    
    // 2. Convert to PDF if Word
    let pdfBuffer;
    if (isWord) {
      pdfBuffer = await ilpConvert(originalBuffer, fname);
    } else {
      pdfBuffer = originalBuffer;
    }
    
    // 3. Parse metadata
    const lookup = TEACHER_LOOKUP[prof.profName] || { matiere: 'mathematiques', classe: '1ere-secondaire' };
    const metadata = {
      fileId: 'duty-pilot-v2-' + prof.email.replace(/[^a-z0-9]/gi, '').slice(0, 8) + '-' + fname.replace(/[^a-z0-9]/gi, '').slice(0, 16) + '-' + Date.now(),
      teacherName: prof.profName,
      originalFormat: isWord ? file.ext : null,
      parsed: {
        title: fname.replace(/\.[^.]+$/, '').replace(/[_-]/g, ' ').substring(0, 80),
        type: 'HOMEWORK',
        subjectSlug: lookup.matiere,
        classSlug: lookup.classe,
        trimester: '1',
        year: file.year || '2024-2025',
        homeworkSubtype: 'CONTROLE',
        homeworkNumber: 1,
        schoolType: 'LYCEE',
        hasCorrection: false,
        language: 'fr',
      },
    };
    
    const result = await importToExamanet(
      pdfBuffer,
      isWord ? originalBuffer : null,
      fname,
      isWord ? file.ext : null,
      metadata
    );
    
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    
    return {
      success: result.success,
      fileName: fname,
      isWord,
      publicUrl: result.fileUrl,
      teacherId: result.teacherId,
      teacherEmail: prof.email,
      resourceId: result.resourceId,
      originalFileUrl: result.originalFileUrl || null,
      pdfSize: pdfBuffer.length,
      originalSize: originalBuffer.length,
      format: file.ext,
      elapsed,
      skipped: result.skipped,
      error: result.error,
    };
  } catch (e) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    return { success: false, fileName: fname, isWord, error: e.message, elapsed };
  }
}

(async () => {
  const selection = JSON.parse(fs.readFileSync('/workspace/docs/devoirat/pilot/5-profs-final.json', 'utf8'));
  
  console.log('=== BULK IMPORT V2 (5 profs with original Word) ===\n');
  const allResults = [];
  const totalStart = Date.now();
  
  for (let i = 0; i < selection.length; i++) {
    const prof = selection[i];
    console.log(`\n--- Prof ${i + 1}/5: ${prof.profName} (${prof.email}) ---`);
    
    for (const file of prof.files) {
      const isWord = file.ext === 'doc' || file.ext === 'docx';
      console.log(`  Processing: ${file.name} (${file.ext}${isWord ? ' → convert to PDF' : ''})...`);
      const result = await processFile(file, prof);
      
      if (result.success) {
        console.log(`  ✓ ${result.fileName} (${result.elapsed}s)`);
        console.log(`    Public PDF URL: ${result.publicUrl?.substring(0, 100)}...`);
        if (isWord && result.originalFileUrl) {
          console.log(`    Original (${result.format}): ${result.originalFileUrl.substring(0, 100)}...`);
        }
      } else if (result.skipped) {
        console.log(`  ⊝ Skipped`);
      } else {
        console.log(`  ✗ FAILED: ${result.error}`);
      }
      allResults.push(result);
      await setTimeout(100);
    }
  }
  
  const totalElapsed = ((Date.now() - totalStart) / 1000).toFixed(1);
  const successCount = allResults.filter(r => r.success).length;
  const failCount = allResults.filter(r => !r.success && !r.skipped).length;
  
  console.log(`\n=== RESULTS ===`);
  console.log(`Total: ${allResults.length} | Success: ${successCount} | Failed: ${failCount}`);
  console.log(`Total time: ${totalElapsed}s | Avg: ${(totalElapsed/allResults.length).toFixed(1)}s/file`);
  
  // Save full results
  fs.writeFileSync('/workspace/docs/devoirat/pilot/bulk-5-results-v2.json', JSON.stringify(allResults, null, 2));
  console.log('Saved to /workspace/docs/devoirat/pilot/bulk-5-results-v2.json');
})();
