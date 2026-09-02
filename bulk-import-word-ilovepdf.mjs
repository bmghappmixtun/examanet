import fs from 'fs';
import path from 'path';
import { setTimeout } from 'timers/promises';

const SEED_TOKEN = 'cffa7e495ff6a441d253b03b8cf1efa7';
const ILOVEPDF_PUBLIC = 'project_public_7e5b50f720b2fd673027b3d8f68df9ba_qbRI430ddd294f2f9e380416776bb43b44a84';
const ILOVEPDF_SECRET = 'secret_key_bd52973cd751403bca3ebacc8b911299_oPz7be0cb77c01582e3a10dc3a93c8689e8b5';

const FILES_BUDGET = 130;  // New token
let filesUsed = 0;

// ============ FILE DOWNLOAD ============
async function downloadFile(url, maxRedirects = 5) {
  let depth = 0;
  while (depth < maxRedirects) {
    const resp = await fetch(url, { 
      redirect: 'manual', 
      headers: { 'User-Agent': 'Mozilla/5.0' } 
    });
    if (resp.status >= 300 && resp.status < 400) {
      const loc = resp.headers.get('location');
      if (!loc) throw new Error('No location');
      url = loc.startsWith('http') ? loc : new URL(loc, url).href;
      depth++;
    } else if (resp.ok) return Buffer.from(await resp.arrayBuffer());
    else throw new Error(`HTTP ${resp.status}`);
  }
  throw new Error('Too many redirects');
}

// ============ iLovePDF CONVERSION ============
let ilovepdfToken = null;
let ilovepdfTokenExpires = 0;

async function getILovePDFToken() {
  const now = Date.now() / 1000;
  if (ilovepdfToken && ilovepdfTokenExpires > now + 60) return ilovepdfToken;
  
  const r = await fetch('https://api.ilovepdf.com/v1/auth', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ public_key: ILOVEPDF_PUBLIC })
  });
  const d = await r.json();
  ilovepdfToken = d.token;
  
  // Parse JWT to get expiry
  try {
    const payload = JSON.parse(Buffer.from(d.token.split('.')[1], 'base64').toString());
    ilovepdfTokenExpires = payload.exp;
  } catch (e) {
    ilovepdfTokenExpires = now + 3000;
  }
  
  return ilovepdfToken;
}

async function convertWithILovePDF(buffer, filename) {
  if (filesUsed >= FILES_BUDGET) throw new Error('ILOVEPDF_BUDGET_EXHAUSTED');
  
  const token = await getILovePDFToken();
  const FormData = (await import('form-data')).default;
  
  // Start task
  const startR = await fetch('https://api.ilovepdf.com/v1/start/officepdf', {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const start = await startR.json();
  
  // Upload
  const fd = new FormData();
  fd.append('task', start.task);
  fd.append('file', buffer, { filename });
  
  const upR = await fetch(`https://${start.server}/v1/upload`, {
    method: 'POST', 
    headers: { 'Authorization': `Bearer ${token}`, ...fd.getHeaders() }, 
    body: fd.getBuffer()
  });
  const up = await upR.json();
  if (up.error) throw new Error(up.error.message);
  
  // Process
  await fetch(`https://${start.server}/v1/process`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      task: start.task,
      files: [{ server_filename: up.server_filename, filename }],
      tool: 'officepdf'
    })
  });
  
  // Download
  const dlR = await fetch(`https://${start.server}/v1/download/${start.task}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (!dlR.ok) throw new Error(`Download ${dlR.status}`);
  
  filesUsed++;
  return Buffer.from(await dlR.arrayBuffer());
}

// ============ UPLOAD TO EXAMANET ============
async function uploadToExamanet(pdfBuffer, originalBuffer, origName, origFmt, metadata) {
  const FormData = (await import('form-data')).default;
  const fd = new FormData();
  fd.append('file', pdfBuffer, 'document.pdf');
  if (originalBuffer && origFmt) {
    fd.append('originalFile', originalBuffer, origName);
  }
  fd.append('metadata', JSON.stringify(metadata));
  
  const r = await fetch('https://examanet.com/api/admin/tunisiecollege-import', {
    method: 'POST', 
    headers: { 'x-seed-token': SEED_TOKEN, ...fd.getHeaders() }, 
    body: fd.getBuffer()
  });
  return r.json();
}

// ============ PARSE METADATA ============
function parseFilename(filename) {
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
  
  const yearMatch = filename.match(/(\d{4})[/-](\d{4})/);
  if (yearMatch) result.year = `${yearMatch[1]}-${yearMatch[2]}`;
  
  if (/math/i.test(filename)) result.subjectSlug = 'mathematiques';
  else if (/physique|phys/i.test(filename)) result.subjectSlug = 'physique';
  else if (/techno/i.test(filename)) result.subjectSlug = 'technologie';
  else if (/svt|sv|tic/i.test(filename)) result.subjectSlug = 'svt';
  else if (/fran[cç]ais/i.test(filename)) result.subjectSlug = 'francais';
  else if (/arabe/i.test(filename)) result.subjectSlug = 'arabe';
  else if (/anglais/i.test(filename)) result.subjectSlug = 'anglais';
  else if (/histoire/i.test(filename)) result.subjectSlug = 'histoire';
  else if (/g[eé]o/i.test(filename)) result.subjectSlug = 'geographie';
  else if (/philo/i.test(filename)) result.subjectSlug = 'philosophie';
  else if (/eco/i.test(filename)) result.subjectSlug = 'economie';
  
  if (/bac/i.test(filename)) result.classSlug = '4eme-secondaire';
  else if (/1[eè]re/i.test(filename)) result.classSlug = '1ere-secondaire';
  else if (/2[eè]me/i.test(filename)) result.classSlug = '2eme-secondaire';
  else if (/3[eè]me/i.test(filename)) result.classSlug = '3eme-secondaire';
  
  if (/synth[eè]se/i.test(filename)) result.homeworkSubtype = 'SYNTHESE';
  else if (/contr[oô]le/i.test(filename)) result.homeworkSubtype = 'CONTROLE';
  else if (/examen/i.test(filename)) result.homeworkSubtype = 'EXAMEN';
  
  const numMatch = filename.match(/N[°o]?\s*(\d+)/i);
  if (numMatch) result.homeworkNumber = parseInt(numMatch[1]);
  
  if (/corr/i.test(filename)) result.hasCorrection = true;
  
  return result;
}

// ============ MAIN ============
(async () => {
  const allFiles = fs.readFileSync('/workspace/docs/devoirat/word-files-final-ilovepdf.jsonl', 'utf8')
    .trim().split('\n').map(l => JSON.parse(l));
  
  console.log(`=== PHASE 4: iLovePDF New Token ===`);
  console.log(`Total Word files: ${allFiles.length}`);
  console.log(`iLovePDF budget: ${FILES_BUDGET} files`);
  
  const PROGRESS_FILE = '/workspace/docs/devoirat/bulk-ilovepdf-progress.json';
  const RESULTS_FILE = '/workspace/docs/devoirat/bulk-ilovepdf-results.jsonl';
  
  let startIdx = 0;
  let successCount = 0;
  let failCount = 0;
  
  try {
    const prog = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
    startIdx = prog.lastFileIdx || 0;
    successCount = prog.successCount || 0;
    failCount = prog.failCount || 0;
    filesUsed = prog.filesUsed || 0;
    console.log(`[Resume] idx=${startIdx}, success=${successCount}, fail=${failCount}, filesUsed=${filesUsed}`);
  } catch (e) {
    console.log(`[Fresh start]`);
  }
  
  const resultsOut = fs.openSync(RESULTS_FILE, 'a');
  
  for (let i = startIdx; i < allFiles.length; i++) {
    const file = allFiles[i];
    const start = Date.now();
    
    try {
      if (filesUsed >= FILES_BUDGET) {
        console.log(`\n⚠️ iLovePDF budget exhausted at idx ${i}`);
        break;
      }
      
      // 1. Download
      const buffer = await downloadFile(file.url);
      
      // 2. Convert
      const pdfBuffer = await convertWithILovePDF(buffer, file.fileName);
      
      // 3. Parse metadata
      const parsed = parseFilename(file.fileName);
      const ext = file.fileName.split('.').pop().toLowerCase();
      
      const metadata = {
        fileId: 'ilovepdf2-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
        teacherName: file.profName,
        originalFormat: ext,
        parsed: {
          title: file.fileName.replace(/\.(docx|doc)$/, '').replace(/[_-]/g, ' ').substring(0, 80),
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
      
      // 4. Upload
      const result = await uploadToExamanet(pdfBuffer, buffer, file.fileName, ext, metadata);
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      
      if (result.success) {
        successCount++;
        fs.writeSync(resultsOut, JSON.stringify({
          success: true, prof: file.profName, fileName: file.fileName,
          conversionMethod: 'ilovepdf',
          publicUrl: result.fileUrl,
          originalUrl: result.originalFileUrl,
          teacherId: result.teacherId,
          elapsed, idx: i, filesUsed,
        }) + '\n');
        
        if (i % 10 === 0) {
          console.log(`[${i+1}/${allFiles.length}] ✓ ${file.profName} | ${file.fileName.slice(0, 40)} (${elapsed}s) | Used: ${filesUsed}/${FILES_BUDGET}`);
        }
      } else {
        failCount++;
        fs.writeSync(resultsOut, JSON.stringify({
          success: false, prof: file.profName, fileName: file.fileName,
          error: result.error, elapsed, idx: i, filesUsed,
        }) + '\n');
        
        console.log(`[${i+1}/${allFiles.length}] ✗ ${file.profName} | ${file.fileName.slice(0, 40)} | Error: ${result.error}`);
      }
      
      // Save progress
      if (i % 5 === 0) {
        fs.writeFileSync(PROGRESS_FILE, JSON.stringify({
          lastFileIdx: i + 1, successCount, failCount, filesUsed,
        }));
      }
      
      await setTimeout(50);
    } catch (e) {
      failCount++;
      fs.writeSync(resultsOut, JSON.stringify({
        success: false, prof: file.profName, fileName: file.fileName,
        error: e.message, idx: i, filesUsed,
      }) + '\n');
      
      if (e.message === 'ILOVEPDF_BUDGET_EXHAUSTED') {
        console.log(`\n⚠️ Budget exhausted at idx ${i}. Stopping.`);
        break;
      }
      
      if (i % 10 === 0) console.log(`[${i+1}/${allFiles.length}] ✗ ${file.profName} | ERROR: ${e.message.slice(0, 80)}`);
      
      fs.writeFileSync(PROGRESS_FILE, JSON.stringify({
        lastFileIdx: i + 1, successCount, failCount, filesUsed,
      }));
    }
  }
  
  fs.closeSync(resultsOut);
  
  console.log(`\n=== DONE ===`);
  console.log(`Success: ${successCount}`);
  console.log(`Failed: ${failCount}`);
  console.log(`iLovePDF used: ${filesUsed}/${FILES_BUDGET}`);
})();
