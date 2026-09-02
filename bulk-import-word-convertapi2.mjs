import fs from 'fs';
import { setTimeout } from 'timers/promises';

const SEED_TOKEN = 'cffa7e495ff6a441d253b03b8cf1efa7';
const CONVERTAPI_TOKEN = 'dk6PahjO14NmFRhBbxxy7g8DGRQKrb14';

const BUDGET = 250;
let used = 0;

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

async function convert(buffer, filename) {
  if (used >= BUDGET) throw new Error('BUDGET_EXHAUSTED');
  const FormData = (await import('form-data')).default;
  const fd = new FormData();
  const lower = filename.toLowerCase();
  const contentType = lower.endsWith('.doc') ? 'application/msword' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  fd.append('File', buffer, { filename, contentType });
  
  const start = Date.now();
  const r = await fetch('https://v2.convertapi.com/convert/docx/to/pdf', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${CONVERTAPI_TOKEN}`, ...fd.getHeaders() },
    body: fd.getBuffer()
  });
  
  const elapsed = Math.ceil((Date.now() - start) / 1000);
  used += elapsed;
  
  if (!r.ok) {
    const text = await r.text();
    throw new Error(`ConvertAPI ${r.status}: ${text.slice(0, 100)}`);
  }
  
  const data = await r.json();
  if (!data.Files?.[0]?.FileData) throw new Error('No FileData');
  return Buffer.from(data.Files[0].FileData, 'base64');
}

async function upload(pdfBuffer, originalBuffer, origName, origFmt, metadata) {
  const FormData = (await import('form-data')).default;
  const fd = new FormData();
  fd.append('file', pdfBuffer, 'document.pdf');
  if (originalBuffer && origFmt) fd.append('originalFile', originalBuffer, origName);
  fd.append('metadata', JSON.stringify(metadata));
  
  const r = await fetch('https://examanet.com/api/admin/tunisiecollege-import', {
    method: 'POST',
    headers: { 'x-seed-token': SEED_TOKEN, ...fd.getHeaders() },
    body: fd.getBuffer()
  });
  return r.json();
}

function parseFilename(filename) {
  const result = {
    type: 'HOMEWORK', homeworkSubtype: 'CONTROLE', homeworkNumber: 1,
    subjectSlug: 'mathematiques', classSlug: '1ere-secondaire', schoolType: 'LYCEE',
    trimester: '1', year: '2024-2025', hasCorrection: false, language: 'fr',
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

(async () => {
  // Use same batch 4 (250 files) - run in parallel with iLovePDF
  // Actually, use the SAME batch because iLovePDF is processing it
  // To avoid double processing, use a DIFFERENT batch
  
  // Get remaining unprocessed files (after Phase 3 + ilovepdf first 8)
  const allRemaining = fs.readFileSync('/workspace/docs/devoirat/word-files-remaining.jsonl', 'utf8')
    .trim().split('\n').map(l => JSON.parse(l));
  
  // Skip first 250 (which iLovePDF is processing)
  const convertBatch = allRemaining.slice(250, 500);
  
  // Wait - we need to write to a different file
  fs.writeFileSync('/workspace/docs/devoirat/word-files-batch5.jsonl', 
    convertBatch.map(w => JSON.stringify(w)).join('\n'));
  
  const allFiles = convertBatch;
  
  console.log(`=== PHASE 4: ConvertAPI 3rd Token ===`);
  console.log(`Total Word files: ${allFiles.length}`);
  console.log(`ConvertAPI budget: ${BUDGET}s`);
  
  const PROGRESS_FILE = '/workspace/docs/devoirat/bulk-convertapi2-progress.json';
  const RESULTS_FILE = '/workspace/docs/devoirat/bulk-convertapi2-results.jsonl';
  
  let startIdx = 0;
  let successCount = 0;
  let failCount = 0;
  
  try {
    const prog = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
    startIdx = prog.lastFileIdx || 0;
    successCount = prog.successCount || 0;
    failCount = prog.failCount || 0;
    used = prog.used || 0;
    console.log(`[Resume] idx=${startIdx}, success=${successCount}, fail=${failCount}, used=${used}s`);
  } catch (e) {
    console.log(`[Fresh start]`);
  }
  
  const resultsOut = fs.openSync(RESULTS_FILE, 'a');
  
  for (let i = startIdx; i < allFiles.length; i++) {
    const file = allFiles[i];
    const start = Date.now();
    
    try {
      if (used >= BUDGET) {
        console.log(`\n⚠️ Budget exhausted at idx ${i}`);
        break;
      }
      
      const buffer = await downloadFile(file.url);
      const pdfBuffer = await convert(buffer, file.fileName);
      const parsed = parseFilename(file.fileName);
      const ext = file.fileName.split('.').pop().toLowerCase();
      
      const metadata = {
        fileId: 'conv3-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
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
      
      const result = await upload(pdfBuffer, buffer, file.fileName, ext, metadata);
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      
      if (result.success) {
        successCount++;
        fs.writeSync(resultsOut, JSON.stringify({
          success: true, prof: file.profName, fileName: file.fileName,
          conversionMethod: 'convertapi2',
          publicUrl: result.fileUrl,
          originalUrl: result.originalFileUrl,
          teacherId: result.teacherId,
          elapsed, idx: i, used,
        }) + '\n');
        
        if (i % 10 === 0) {
          console.log(`[${i+1}/${allFiles.length}] ✓ ${file.profName} | ${file.fileName.slice(0, 40)} (${elapsed}s) | Used: ${used}s/${BUDGET}`);
        }
      } else {
        failCount++;
        fs.writeSync(resultsOut, JSON.stringify({
          success: false, prof: file.profName, fileName: file.fileName,
          error: result.error, elapsed, idx: i, used,
        }) + '\n');
        
        if (i % 5 === 0) console.log(`[${i+1}/${allFiles.length}] ✗ ${file.profName} | Error: ${result.error}`);
      }
      
      if (i % 5 === 0) {
        fs.writeFileSync(PROGRESS_FILE, JSON.stringify({
          lastFileIdx: i + 1, successCount, failCount, used,
        }));
      }
      
      await setTimeout(50);
    } catch (e) {
      failCount++;
      fs.writeSync(resultsOut, JSON.stringify({
        success: false, prof: file.profName, fileName: file.fileName,
        error: e.message, idx: i, used,
      }) + '\n');
      
      if (e.message === 'BUDGET_EXHAUSTED') {
        console.log(`\n⚠️ Budget exhausted at idx ${i}`);
        break;
      }
      
      if (i % 5 === 0) console.log(`[${i+1}/${allFiles.length}] ✗ ERROR: ${e.message.slice(0, 80)}`);
      
      fs.writeFileSync(PROGRESS_FILE, JSON.stringify({
        lastFileIdx: i + 1, successCount, failCount, used,
      }));
    }
  }
  
  fs.closeSync(resultsOut);
  
  console.log(`\n=== DONE ===`);
  console.log(`Success: ${successCount}, Failed: ${failCount}, Used: ${used}/${BUDGET}`);
})();
