import fs from 'fs';
import path from 'path';
import { setTimeout } from 'timers/promises';

const SEED_TOKEN = 'cffa7e495ff6a441d253b03b8cf1efa7';

// Load unmatched files
const allFiles = fs.readFileSync('/workspace/docs/devoirat/unmatched-files.jsonl', 'utf8')
  .trim().split('\n').map(l => JSON.parse(l));

// ============ FILE DOWNLOAD (handles Jimdo redirects) ============
async function downloadFile(url, maxRedirects = 8) {
  let depth = 0;
  while (depth < maxRedirects) {
    const resp = await fetch(url, { 
      redirect: 'manual', 
      headers: { 'User-Agent': 'Mozilla/5.0' } 
    });
    if (resp.status >= 300 && resp.status < 400) {
      const loc = resp.headers.get('location');
      if (!loc) throw new Error('No location header');
      url = loc.startsWith('http') ? loc : new URL(loc, url).href;
      depth++;
    } else if (resp.ok) return Buffer.from(await resp.arrayBuffer());
    else throw new Error(`HTTP ${resp.status}`);
  }
  throw new Error('Too many redirects');
}

// ============ UPLOAD TO EXAMANET ============
async function uploadToExamanet(pdfBuffer, metadata) {
  const FormData = (await import('form-data')).default;
  const fd = new FormData();
  fd.append('file', pdfBuffer, 'document.pdf');
  fd.append('metadata', JSON.stringify(metadata));
  
  const r = await fetch('https://examanet.com/api/admin/tunisiecollege-import', {
    method: 'POST', 
    headers: { 'x-seed-token': SEED_TOKEN, ...fd.getHeaders() }, 
    body: fd.getBuffer()
  });
  return r.json();
}

// ============ PARSE METADATA FROM TITLE ============
function parseTitle(title) {
  const result = {
    type: 'HOMEWORK',
    homeworkSubtype: 'CONTROLE',
    homeworkNumber: 1,
    subjectSlug: 'mathematiques',
    classSlug: '1ere-secondaire',
    schoolType: 'LYCEE',
    trimester: '1',
    year: '2024-2025',
    hasCorrection: false,
    language: 'fr',
  };
  
  // Detect year
  const yearMatch = title.match(/\((\d{4})[/-](\d{4})\)/);
  if (yearMatch) {
    result.year = `${yearMatch[1]}-${yearMatch[2]}`;
  }
  
  // Detect subject
  if (/math/i.test(title)) result.subjectSlug = 'mathematiques';
  else if (/physique|phys/i.test(title)) result.subjectSlug = 'physique';
  else if (/techno/i.test(title)) result.subjectSlug = 'technologie';
  else if (/svt|sv|science/i.test(title)) result.subjectSlug = 'svt';
  else if (/fran[cç]ais|fr/i.test(title)) result.subjectSlug = 'francais';
  else if (/arabe|arab/i.test(title)) result.subjectSlug = 'arabe';
  else if (/anglais|english/i.test(title)) result.subjectSlug = 'anglais';
  else if (/histoire|history/i.test(title)) result.subjectSlug = 'histoire';
  else if (/g[eé]o/i.test(title)) result.subjectSlug = 'geographie';
  else if (/philo/i.test(title)) result.subjectSlug = 'philosophie';
  else if (/info|informatique/i.test(title)) result.subjectSlug = 'informatique';
  else if (/[eé]conomie|eco/i.test(title)) result.subjectSlug = 'economie';
  
  // Detect class
  if (/bac/i.test(title)) result.classSlug = '4eme-secondaire';
  else if (/1[eè]re\s*as|1[eè]re\s*ann/i.test(title)) result.classSlug = '1ere-secondaire';
  else if (/2[eè]me/i.test(title)) result.classSlug = '2eme-secondaire';
  else if (/3[eè]me/i.test(title)) result.classSlug = '3eme-secondaire';
  else if (/4[eè]me/i.test(title)) result.classSlug = '4eme-secondaire';
  
  // Detect type
  if (/synth[eè]se/i.test(title)) result.homeworkSubtype = 'SYNTHESE';
  else if (/contr[oô]le/i.test(title)) result.homeworkSubtype = 'CONTROLE';
  else if (/examen/i.test(title)) result.homeworkSubtype = 'EXAMEN';
  
  // Detect homework number
  const numMatch = title.match(/N[°o]?\s*(\d+)/i);
  if (numMatch) result.homeworkNumber = parseInt(numMatch[1]);
  
  // Detect correction
  if (/avec\s*corr|correction/i.test(title)) result.hasCorrection = true;
  
  // Trimester
  if (/2[eè]me\s*trim|trimestre\s*2/i.test(title)) result.trimester = '2';
  else if (/3[eè]me\s*trim|trimestre\s*3/i.test(title)) result.trimester = '3';
  
  return result;
}

// ============ MAIN ============
(async () => {
  console.log(`=== PHASE 2: Import Unmatched Profs ===`);
  console.log(`Total files: ${allFiles.length}`);
  console.log(`Unique profs: ${new Set(allFiles.map(f => f.profName)).size}`);
  
  const PROGRESS_FILE = '/workspace/docs/devoirat/bulk-unmatched-progress.json';
  const RESULTS_FILE = '/workspace/docs/devoirat/bulk-unmatched-results.jsonl';
  
  let startIdx = 0;
  let successCount = 0;
  let failCount = 0;
  
  try {
    const prog = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
    startIdx = prog.lastFileIdx || 0;
    successCount = prog.successCount || 0;
    failCount = prog.failCount || 0;
    console.log(`[Resume] Starting from idx ${startIdx}, ${successCount} success, ${failCount} fail`);
  } catch (e) {
    console.log(`[Fresh start]`);
  }
  
  const resultsOut = fs.openSync(RESULTS_FILE, 'a');
  
  for (let i = startIdx; i < allFiles.length; i++) {
    const file = allFiles[i];
    const start = Date.now();
    
    try {
      // 1. Download from Jimdo
      const buffer = await downloadFile(file.pdfUrl);
      
      // 2. Parse title for metadata
      const parsed = parseTitle(file.title);
      const metadata = {
        fileId: 'duty2-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
        teacherName: file.profName,
        originalFormat: null, // Already PDF
        parsed: {
          title: file.title,
          type: parsed.type,
          subjectSlug: parsed.subjectSlug,
          classSlug: parsed.classSlug,
          trimester: parsed.trimester,
          year: parsed.year,
          homeworkSubtype: parsed.homeworkSubtype,
          homeworkNumber: parsed.homeworkNumber,
          schoolType: parsed.schoolType,
          hasCorrection: parsed.hasCorrection,
          language: parsed.language,
        },
      };
      
      // 3. Upload
      const result = await uploadToExamanet(buffer, metadata);
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      
      if (result.success) {
        successCount++;
        fs.writeSync(resultsOut, JSON.stringify({
          success: true, prof: file.profName, fileName: file.title,
          publicUrl: result.fileUrl, teacherId: result.teacherId,
          elapsed, idx: i,
        }) + '\n');
        
        if (i % 50 === 0) {
          console.log(`[${i}/${allFiles.length}] ✓ ${file.profName} | ${file.title.slice(0, 40)} (${elapsed}s) | Success: ${successCount} | Fail: ${failCount}`);
        }
      } else {
        failCount++;
        fs.writeSync(resultsOut, JSON.stringify({
          success: false, prof: file.profName, fileName: file.title,
          error: result.error, elapsed, idx: i,
        }) + '\n');
        
        if (i % 20 === 0 || result.error) {
          console.log(`[${i}/${allFiles.length}] ✗ ${file.profName} | ${file.title.slice(0, 40)} (${elapsed}s) | Error: ${result.error}`);
        }
      }
      
      // Save progress every 10 files
      if (i % 10 === 0) {
        fs.writeFileSync(PROGRESS_FILE, JSON.stringify({
          lastFileIdx: i, successCount, failCount,
        }));
      }
      
      await setTimeout(50);
    } catch (e) {
      failCount++;
      fs.writeSync(resultsOut, JSON.stringify({
        success: false, prof: file.profName, fileName: file.title,
        error: e.message, idx: i,
      }) + '\n');
      
      if (i % 20 === 0) {
        console.log(`[${i}/${allFiles.length}] ✗ ${file.profName} | ERROR: ${e.message.slice(0, 60)}`);
      }
      
      // Save progress
      fs.writeFileSync(PROGRESS_FILE, JSON.stringify({
        lastFileIdx: i, successCount, failCount,
      }));
    }
  }
  
  fs.closeSync(resultsOut);
  
  console.log(`\n=== DONE ===`);
  console.log(`Total: ${allFiles.length}`);
  console.log(`Success: ${successCount}`);
  console.log(`Failed: ${failCount}`);
})();
