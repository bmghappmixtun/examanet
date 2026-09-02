import fs from 'fs';
import path from 'path';
import { setTimeout } from 'timers/promises';

const SEED_TOKEN = 'cffa7e495ff6a441d253b03b8cf1efa7';
const CONVERTAPI_TOKEN = 'vcydlVrJbBIsxqhQGY58NHnKMFsiGPMG';

const CONVERTAPI_BUDGET_SEC = 250;  // Free tier
let convertApiUsed = 0;

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

// ============ ConvertAPI CONVERSION ============
async function convertWithConvertAPI(buffer, filename) {
  if (convertApiUsed >= CONVERTAPI_BUDGET_SEC) {
    throw new Error('CONVERTAPI_BUDGET_EXHAUSTED');
  }
  
  console.log(`[DEBUG] buffer length: ${buffer.length}, first 4: ${buffer.slice(0, 4).toString('hex')}, filename: ${filename}`);
  
  const FormData = (await import('form-data')).default;
  const fd = new FormData();
  // Determine content type
  const lower = filename.toLowerCase();
  let contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  if (lower.endsWith('.doc')) {
    contentType = 'application/msword';
  }
  fd.append('File', buffer, { filename, contentType });
  console.log(`[DEBUG] FormData headers: ${JSON.stringify(fd.getHeaders())}`);
  
  const start = Date.now();
  const r = await fetch('https://v2.convertapi.com/convert/docx/to/pdf', {
    method: 'POST', 
    headers: { 'Authorization': `Bearer ${CONVERTAPI_TOKEN}`, ...fd.getHeaders() }, 
    body: fd.getBuffer()
  });
  
  const elapsed = (Date.now() - start) / 1000;
  convertApiUsed += Math.ceil(elapsed);  // Round up
  
  if (!r.ok) {
    const text = await r.text();
    throw new Error(`ConvertAPI ${r.status}: ${text.slice(0, 100)}`);
  }
  
  const data = await r.json();
  if (!data.Files?.[0]?.FileData) throw new Error('No FileData');
  return Buffer.from(data.Files[0].FileData, 'base64');
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

// ============ PARSE METADATA FROM FILENAME ============
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
  
  // Detect year
  const yearMatch = filename.match(/(\d{4})[/-](\d{4})/);
  if (yearMatch) {
    result.year = `${yearMatch[1]}-${yearMatch[2]}`;
  }
  
  // Subject
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
  
  // Class
  if (/bac/i.test(filename)) result.classSlug = '4eme-secondaire';
  else if (/1[eè]re/i.test(filename)) result.classSlug = '1ere-secondaire';
  else if (/2[eè]me/i.test(filename)) result.classSlug = '2eme-secondaire';
  else if (/3[eè]me/i.test(filename)) result.classSlug = '3eme-secondaire';
  
  // Type
  if (/synth[eè]se/i.test(filename)) result.homeworkSubtype = 'SYNTHESE';
  else if (/contr[oô]le/i.test(filename)) result.homeworkSubtype = 'CONTROLE';
  else if (/examen/i.test(filename)) result.homeworkSubtype = 'EXAMEN';
  
  // Number
  const numMatch = filename.match(/N[°o]?\s*(\d+)/i);
  if (numMatch) result.homeworkNumber = parseInt(numMatch[1]);
  
  // Correction
  if (/corr/i.test(filename)) result.hasCorrection = true;
  
  return result;
}

// ============ MAIN ============
(async () => {
  const allFiles = fs.readFileSync('/workspace/docs/devoirat/word-files-batch3.jsonl', 'utf8')
    .trim().split('\n').map(l => JSON.parse(l));
  
  console.log(`=== PHASE 3: ConvertAPI Free Tier ===`);
  console.log(`Total Word files to process: ${allFiles.length}`);
  console.log(`ConvertAPI budget: ${CONVERTAPI_BUDGET_SEC}s`);
  
  const PROGRESS_FILE = '/workspace/docs/devoirat/bulk-word-progress.json';
  const RESULTS_FILE = '/workspace/docs/devoirat/bulk-word-results.jsonl';
  
  let startIdx = 0;
  let successCount = 0;
  let failCount = 0;
  
  try {
    const prog = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
    startIdx = prog.lastFileIdx || 0;
    successCount = prog.successCount || 0;
    failCount = prog.failCount || 0;
    convertApiUsed = prog.convertApiUsed || 0;
    console.log(`[Resume] idx=${startIdx}, success=${successCount}, fail=${failCount}, convertApi=${convertApiUsed}s used`);
  } catch (e) {
    console.log(`[Fresh start]`);
  }
  
  const resultsOut = fs.openSync(RESULTS_FILE, 'a');
  
  for (let i = startIdx; i < allFiles.length; i++) {
    const file = allFiles[i];
    const start = Date.now();
    
    try {
      // Check budget
      if (convertApiUsed >= CONVERTAPI_BUDGET_SEC) {
        console.log(`\n⚠️ ConvertAPI budget exhausted at idx ${i} (${convertApiUsed}s used)`);
        break;
      }
      
      // 1. Download Word from JotForm CDN
      const buffer = await downloadFile(file.url);
      
      // 2. Convert via ConvertAPI
      const pdfBuffer = await convertWithConvertAPI(buffer, file.fileName);
      
      // 3. Parse metadata
      const parsed = parseFilename(file.fileName);
      const ext = file.fileName.split('.').pop().toLowerCase();
      
      const metadata = {
        fileId: 'conv-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
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
      
      // 4. Upload to Examanet (with original Word stored)
      const result = await uploadToExamanet(pdfBuffer, buffer, file.fileName, ext, metadata);
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      
      if (result.success) {
        successCount++;
        fs.writeSync(resultsOut, JSON.stringify({
          success: true, prof: file.profName, fileName: file.fileName,
          conversionMethod: 'convertapi',
          publicUrl: result.fileUrl,
          originalUrl: result.originalFileUrl,
          teacherId: result.teacherId,
          elapsed, idx: i, convertApiUsed,
        }) + '\n');
        
        console.log(`[${i+1}/${allFiles.length}] ✓ ${file.profName} | ${file.fileName.slice(0, 40)} (${elapsed}s) | ConvertAPI: ${convertApiUsed}s/${CONVERTAPI_BUDGET_SEC}s`);
      } else {
        failCount++;
        fs.writeSync(resultsOut, JSON.stringify({
          success: false, prof: file.profName, fileName: file.fileName,
          error: result.error, elapsed, idx: i, convertApiUsed,
        }) + '\n');
        
        console.log(`[${i+1}/${allFiles.length}] ✗ ${file.profName} | ${file.fileName.slice(0, 40)} | Error: ${result.error}`);
      }
      
      // Save progress
      fs.writeFileSync(PROGRESS_FILE, JSON.stringify({
        lastFileIdx: i + 1,
        successCount, failCount, convertApiUsed,
      }));
      
      await setTimeout(50);
    } catch (e) {
      failCount++;
      fs.writeSync(resultsOut, JSON.stringify({
        success: false, prof: file.profName, fileName: file.fileName,
        error: e.message, idx: i, convertApiUsed,
      }) + '\n');
      
      if (e.message === 'CONVERTAPI_BUDGET_EXHAUSTED') {
        console.log(`\n⚠️ Budget exhausted at idx ${i}. Stopping.`);
        break;
      }
      
      console.log(`[${i+1}/${allFiles.length}] ✗ ${file.profName} | ${file.fileName.slice(0, 40)} | Error: ${e.message.slice(0, 80)}`);
      
      fs.writeFileSync(PROGRESS_FILE, JSON.stringify({
        lastFileIdx: i + 1,
        successCount, failCount, convertApiUsed,
      }));
    }
  }
  
  fs.closeSync(resultsOut);
  
  console.log(`\n=== DONE ===`);
  console.log(`Processed: ${startIdx} to ${allFiles.length}`);
  console.log(`Success: ${successCount}`);
  console.log(`Failed: ${failCount}`);
  console.log(`ConvertAPI used: ${convertApiUsed}s/${CONVERTAPI_BUDGET_SEC}s`);
})();
