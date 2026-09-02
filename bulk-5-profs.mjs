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
  
  // 1. Start task
  const startR = await fetch(`${API_BASE}/v1/start/officepdf`, {
    headers: { 'Authorization': `Bearer ${ilpToken}` }
  });
  const start = await startR.json();
  
  // 2. Upload
  const fd = new FormData();
  fd.append('task', start.task);
  fd.append('file', buffer, { filename });
  const upR = await fetch(`https://${start.server}/v1/upload`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${ilpToken}`, ...fd.getHeaders() },
    body: fd.getBuffer()
  });
  const up = await upR.json();
  
  // 3. Process
  await fetch(`https://${start.server}/v1/process`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${ilpToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      task: start.task,
      files: [{ server_filename: up.server_filename, filename }],
      tool: 'officepdf'
    })
  });
  
  // 4. Download
  const dlR = await fetch(`https://${start.server}/v1/download/${start.task}`, {
    headers: { 'Authorization': `Bearer ${ilpToken}` }
  });
  return Buffer.from(await dlR.arrayBuffer());
}

// Download with redirect support
async function downloadFile(url) {
  const resp = await fetch(url, { redirect: 'follow', headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!resp.ok) throw new Error(`HTTP ${resp.status} for ${url}`);
  return Buffer.from(await resp.arrayBuffer());
}

// Upload to Examanet API
const SEED_TOKEN = 'cffa7e495ff6a441d253b03b8cf1efa7';
const TEACHER_LOOKUP = {
  'Ouerghi Chokri': { matiere: 'mathematiques', classe: '4eme-secondaire', section: 'Sciences exp' },
  'Hammadi Med ALi': { matiere: 'physique', classe: '4eme-secondaire', section: 'Sciences exp' },
  'HERMI NAOUFEL': { matiere: 'mathematiques', classe: '1ere-secondaire' },
  'Chagraoui Abdelfatteh': { matiere: 'mathematiques', classe: '1ere-secondaire' },
  'Dhahri Mondher': { matiere: 'physique', classe: '4eme-secondaire' },
};

async function importToExamanet(pdfBuffer, metadata) {
  const FormData = (await import('form-data')).default;
  const fd = new FormData();
  fd.append('file', pdfBuffer, 'document.pdf');
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
    let pdfBuffer;
    let originalFileBuffer = null;
    let originalFormat = file.ext;
    
    // 1. Download
    originalFileBuffer = await downloadFile(file.url);
    
    // 2. Convert if Word
    if (isWord) {
      pdfBuffer = await ilpConvert(originalFileBuffer, fname);
    } else {
      pdfBuffer = originalFileBuffer;
    }
    
    // 3. Parse metadata
    const sub = file; // already has subject, class, year, type
    const lookup = TEACHER_LOOKUP[prof.profName] || { matiere: 'mathematiques', classe: '1ere-secondaire' };
    const metadata = {
      fileId: 'duty-pilot-' + prof.email.replace(/[^a-z0-9]/gi, '').slice(0, 8) + '-' + fname.replace(/[^a-z0-9]/gi, '').slice(0, 16) + '-' + Date.now(),
      teacherName: prof.profName,
      parsed: {
        title: fname.replace(/\.[^.]+$/, '').replace(/[_-]/g, ' ').substring(0, 80),
        type: 'HOMEWORK',
        subjectSlug: lookup.matiere || 'mathematiques',
        classSlug: lookup.classe || '1ere-secondaire',
        trimester: '1',
        year: sub.year || '2024-2025',
        homeworkSubtype: 'CONTROLE',
        homeworkNumber: 1,
        schoolType: 'LYCEE',
        hasCorrection: false,
        language: 'fr',
      },
    };
    
    // 4. Upload to Examanet
    const result = await importToExamanet(pdfBuffer, metadata);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    
    return {
      success: result.success,
      fileUrl: result.fileUrl,
      resourceId: result.resourceId,
      teacherId: result.teacherId,
      fileName: fname,
      isWord,
      pdfSize: pdfBuffer.length,
      originalSize: originalFileBuffer.length,
      elapsed,
      skipped: result.skipped,
      error: result.error,
    };
  } catch (e) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    return {
      success: false,
      fileName: fname,
      isWord,
      error: e.message,
      elapsed,
    };
  }
}

(async () => {
  const selection = JSON.parse(fs.readFileSync('/workspace/docs/devoirat/pilot/5-profs-final.json', 'utf8'));
  
  console.log('=== BULK IMPORT 5 PROFS ===\n');
  const allResults = [];
  let totalStart = Date.now();
  
  for (let i = 0; i < selection.length; i++) {
    const prof = selection[i];
    console.log(`\n--- Prof ${i + 1}/5: ${prof.profName} (${prof.email}) ---`);
    
    for (const file of prof.files) {
      console.log(`  Processing: ${file.name} (${file.ext})...`);
      const result = await processFile(file, prof);
      
      if (result.success) {
        console.log(`  ✓ ${result.fileName} (${result.elapsed}s)`);
        console.log(`    URL: ${result.fileUrl}`);
      } else if (result.skipped) {
        console.log(`  ⊝ Skipped (already imported): ${result.fileName}`);
      } else {
        console.log(`  ✗ FAILED: ${result.fileName} - ${result.error}`);
      }
      allResults.push({ prof: prof.profName, email: prof.email, ...result });
      await setTimeout(100); // small delay
    }
  }
  
  const totalElapsed = ((Date.now() - totalStart) / 1000).toFixed(1);
  const successCount = allResults.filter(r => r.success).length;
  const skipCount = allResults.filter(r => r.skipped).length;
  const failCount = allResults.filter(r => !r.success && !r.skipped).length;
  
  console.log(`\n=== RESULTS ===`);
  console.log(`Total files: ${allResults.length}`);
  console.log(`Success: ${successCount}`);
  console.log(`Skipped: ${skipCount}`);
  console.log(`Failed: ${failCount}`);
  console.log(`Total time: ${totalElapsed}s (${(totalElapsed / allResults.length).toFixed(1)}s/file avg)`);
  
  // Save results
  fs.writeFileSync('/workspace/docs/devoirat/pilot/bulk-5-results.json', JSON.stringify(allResults, null, 2));
})();
