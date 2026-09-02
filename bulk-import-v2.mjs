import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { setTimeout } from 'timers/promises';

const SEED_TOKEN = 'cffa7e495ff6a441d253b03b8cf1efa7';
const ILOVEPDF_PUBLIC = 'project_public_d1448365692fd5dee0aa5e617dc877a3_oZ7Rs0e163492d3ce295974b66731db65ce9c';
const CONVERTAPI_TOKEN = '9sHtKOnC79ZZ4FDxcBYTf9wlLFVXLUtM';

// Track conversion tokens
const tokenState = {
  ilovepdf: { remaining: 243, files: 0 },
  convertapi: { remaining: 100, files: 0 },
  libreoffice: { files: 0 },
  jimdoDownloads: { files: 0, skipped: 0 },
};

// Load actual remaining from progress file (resume support)
try {
  const prog = JSON.parse(fs.readFileSync('/workspace/docs/devoirat/bulk-progress.json', 'utf8'));
  if (prog.ilovepdf) {
    tokenState.ilovepdf = prog.ilovepdf;
    console.log(`[Resume] iLovePDF: ${tokenState.ilovepdf.files} used, ${tokenState.ilovepdf.remaining} remaining`);
  }
  if (prog.convertapi) {
    tokenState.convertapi = prog.convertapi;
    console.log(`[Resume] ConvertAPI: ${tokenState.convertapi.files} used, ${tokenState.convertapi.remaining}s remaining`);
  }
} catch (e) {
  console.log('[Fresh start] no progress file');
}

// ============ FILE DOWNLOAD ============
async function downloadFile(url, maxRedirects = 5) {
  let depth = 0;
  while (depth < maxRedirects) {
    const resp = await fetch(url, { redirect: 'manual', headers: { 'User-Agent': 'Mozilla/5.0' } });
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
async function ilovepdfAuth() {
  if (ilovepdfToken) return ilovepdfToken;
  const r = await fetch('https://api.ilovepdf.com/v1/auth', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ public_key: ILOVEPDF_PUBLIC })
  });
  const d = await r.json();
  ilovepdfToken = d.token;
  return ilovepdfToken;
}

async function convertWithILovePDF(buffer, filename) {
  if (tokenState.ilovepdf.remaining <= 0) throw new Error('ILOVE_OUT_OF_TOKENS');
  const token = await ilovepdfAuth();
  const FormData = (await import('form-data')).default;
  
  const startR = await fetch('https://api.ilovepdf.com/v1/start/officepdf', {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const start = await startR.json();
  
  const fd = new FormData();
  fd.append('task', start.task);
  fd.append('file', buffer, { filename });
  const upR = await fetch(`https://${start.server}/v1/upload`, {
    method: 'POST', headers: { 'Authorization': `Bearer ${token}`, ...fd.getHeaders() }, body: fd.getBuffer()
  });
  const up = await upR.json();
  if (up.error) throw new Error(up.error.message);
  
  await fetch(`https://${start.server}/v1/process`, {
    method: 'POST', headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      task: start.task,
      files: [{ server_filename: up.server_filename, filename }],
      tool: 'officepdf'
    })
  });
  
  const dlR = await fetch(`https://${start.server}/v1/download/${start.task}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (!dlR.ok) throw new Error(`Download ${dlR.status}`);
  tokenState.ilovepdf.remaining--;
  tokenState.ilovepdf.files++;
  return Buffer.from(await dlR.arrayBuffer());
}

// ============ ConvertAPI CONVERSION ============
async function convertWithConvertAPI(buffer, filename) {
  if (tokenState.convertapi.remaining <= 0) throw new Error('CONVERTAPI_OUT');
  
  const fd = new FormData();
  fd.append('File', buffer, filename);
  
  const r = await fetch('https://v2.convertapi.com/convert/docx/to/pdf', {
    method: 'POST', headers: { 'Authorization': `Bearer ${CONVERTAPI_TOKEN}` }, body: fd
  });
  
  // Consume ~3 sec per call
  tokenState.convertapi.remaining -= 3;
  tokenState.convertapi.files++;
  
  if (!r.ok) {
    const text = await r.text();
    throw new Error(`ConvertAPI ${r.status}: ${text.slice(0, 100)}`);
  }
  
  const data = await r.json();
  if (!data.Files?.[0]?.FileData) throw new Error('No FileData');
  return Buffer.from(data.Files[0].FileData, 'base64');
}

// ============ LibreOffice CONVERSION ============
function convertWithLibreOffice(inputPath, outputDir) {
  return new Promise((resolve, reject) => {
    const proc = spawn('soffice', ['--headless', '--convert-to', 'pdf', '--outdir', outputDir, inputPath]);
    let out = '';
    proc.stderr.on('data', d => out += d.toString());
    proc.on('close', code => {
      const base = path.basename(inputPath, path.extname(inputPath));
      const final = path.join(outputDir, base + '.pdf');
      if (fs.existsSync(final)) {
        tokenState.libreoffice.files++;
        resolve(final);
      } else {
        reject(new Error(`LO failed: ${out.slice(0, 200)}`));
      }
    });
  });
}

// ============ UPLOAD TO EXAMANET ============
async function uploadToExamanet(pdfBuffer, originalBuffer, origName, origFmt, metadata) {
  const FormData = (await import('form-data')).default;
  const fd = new FormData();
  fd.append('file', pdfBuffer, 'document.pdf');
  if (originalBuffer && origFmt) fd.append('originalFile', originalBuffer, origName);
  fd.append('metadata', JSON.stringify(metadata));
  
  const r = await fetch('https://examanet.com/api/admin/tunisiecollege-import', {
    method: 'POST', headers: { 'x-seed-token': SEED_TOKEN, ...fd.getHeaders() }, body: fd.getBuffer()
  });
  return r.json();
}

// ============ KEYWORD DETECTION ============
function looksLikeMathContent(text) {
  if (!text) return false;
  // Check for common Tunisian math/probability keywords
  const mathKeywords = /\b(équation|solution|probabilité|variance|écart|moyenne|fonction|dériv|limite|intégrale|matrice|vecteur|loi|binomiale|exponentielle|algorithme|probabilit|déviation|théorème|lognormale|binomiale|poisson)\b/i;
  return mathKeywords.test(text);
}

// ============ PROCESS ONE FILE ============
async function processFile(file, prof, tmpDir, profInfo) {
  const start = Date.now();
  const isWord = file.ext === 'doc' || file.ext === 'docx';
  
  try {
    // 1. Download
    const buffer = await downloadFile(file.url);
    
    // 2. Convert if Word (smart routing)
    let pdfBuffer;
    let conversionMethod = null;
    let originalBuffer = isWord ? buffer : null;
    let originalFormat = isWord ? file.ext : null;
    
    if (isWord) {
      const safeName = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
      const docxPath = `${tmpDir}/${safeName}`;
      fs.writeFileSync(docxPath, buffer);
      
      try {
        if (tokenState.ilovepdf.remaining > 0) {
          pdfBuffer = await convertWithILovePDF(buffer, file.name);
          conversionMethod = 'ilovepdf';
        } else if (tokenState.convertapi.remaining > 0) {
          pdfBuffer = await convertWithConvertAPI(buffer, file.name);
          conversionMethod = 'convertapi';
        } else {
          // BOTH services exhausted - PAUSE and ask user
          throw new Error('PAUSE_NEEDED');
        }
      } catch (e) {
        if (e.message === 'PAUSE_NEEDED') throw e;
        // Conversion error - mark as failed but continue
        throw e;
      }
    } else {
      pdfBuffer = buffer;
    }
    
    // 3. Get subject/class
    const SUBJECT = { math: 'mathematiques', maths: 'mathematiques', mathematiques: 'mathematiques', physique: 'physique', technologies: 'technologie', technologie: 'technologie' };
    const CLASS = { bac: '4eme-secondaire', '1ère as': '1ere-secondaire', '1ere as': '1ere-secondaire', '2ème': '2eme-secondaire', '3ème': '3eme-secondaire' };
    const subjectLower = (file.subject || '').toLowerCase();
    const classLower = (file.classe || '').toLowerCase();
    const subjectSlug = SUBJECT[subjectLower] || 'mathematiques';
    const classSlug = CLASS[classLower] || '1ere-secondaire';
    
    // 4. Upload to Examanet
    const metadata = {
      fileId: 'duty-' + profInfo.email.slice(0, 5) + '-' + Date.now() + '-' + Math.floor(Math.random()*1000),
      teacherName: profInfo.profName,
      originalFormat,
      parsed: {
        title: file.name.replace(/\.(docx|doc)$/, '').replace(/[_-]/g, ' ').substring(0, 80),
        type: 'HOMEWORK',
        subjectSlug,
        classSlug,
        trimester: '1',
        year: file.year || '2024-2025',
        homeworkSubtype: 'CONTROLE',
        homeworkNumber: 1,
        schoolType: 'LYCEE',
        hasCorrection: false,
        language: 'fr',
      },
    };
    
    const result = await uploadToExamanet(pdfBuffer, originalBuffer, file.name, originalFormat, metadata);
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    
    if (result.success) {
      return {
        success: true, fileName: file.name, prof: profInfo.profName,
        conversionMethod, pdfSize: pdfBuffer.length, origSize: buffer.length,
        publicUrl: result.fileUrl, originalUrl: result.originalFileUrl,
        teacherId: result.teacherId, elapsed, fileExt: file.ext,
      };
    } else {
      return { success: false, fileName: file.name, error: result.error, elapsed };
    }
  } catch (e) {
    return { success: false, fileName: file.name, error: e.message };
  }
}

// ============ MAIN ============
(async () => {
  // Load all prof submissions
  const allJf = fs.readFileSync('/workspace/docs/devoirat/jotform-devoirat.jsonl', 'utf8')
    .trim().split('\n').map(l => JSON.parse(l));
  
  // Load duty cards
  const duty = fs.readFileSync('/workspace/docs/devoirat/cards-raw.jsonl', 'utf8')
    .trim().split('\n').map(l => JSON.parse(l));
  
  // Load matched emails
  const emailMap = JSON.parse(fs.readFileSync('/workspace/docs/devoirat/email-map.json', 'utf8'));
  
  // Get matched profs (email format)
  const matchedProfs = []; // {email, profName, files[]}
  for (const [email, data] of Object.entries(emailMap)) {
    matchedProfs.push({
      email,
      profName: data.profName,
      jfName: data.jfName,
      files: data.submissions.flatMap(s => s.files.map(f => ({
        url: f,
        name: f.split('/').pop(),
        ext: (f.split('.').pop() || '').toLowerCase().split('?')[0],
        subject: s.subject,
        classe: s.classe,
        year: s.year,
        type: s.type,
        subId: s.id,
      })))
    });
  }
  
  // Calculate unmatched (Jimdo) profs
  const teacherRe = /^(Mr|Mme|Mlle|Prof|Professeur|Mr\.|Mme\.)\s+(.+)/;
  const allDutyTeachers = new Set();
  for (const c of duty) {
    const m = c.description?.match(teacherRe);
    if (m) allDutyTeachers.add(m[2].trim());
  }
  
  const matchedNames = new Set(matchedProfs.map(p => p.profName));
  const unmatchedTeachers = [...allDutyTeachers].filter(t => !matchedNames.has(t));
  
  console.log(`=== BULK IMPORT v2 ===`);
  console.log(`Matched profs: ${matchedProfs.length}`);
  console.log(`Unmatched (Jimdo only): ${unmatchedTeachers.length}`);
  console.log(`iLovePDF remaining: ${tokenState.ilovepdf.remaining}`);
  console.log(`ConvertAPI remaining: ${tokenState.convertapi.remaining}s`);
  
  const tmpDir = '/workspace/docs/devoirat/bulk-tmp';
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  
  const PROGRESS_FILE = '/workspace/docs/devoirat/bulk-progress.json';
  const RESULTS_FILE = '/workspace/docs/devoirat/bulk-results.jsonl';
  
  // Existing progress (resumable)
  const progress = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
  const startIdx = progress.lastProfIdx || 0;
  
  const resultsOut = fs.openSync(RESULTS_FILE, 'a');
  let processed = startIdx;
  let successCount = progress.successCount || 0;
  let failCount = progress.failCount || 0;
  
  // ====== Phase 1: Process matched profs from JotForm ======
  for (let i = startIdx; i < matchedProfs.length; i++) {
    const prof = matchedProfs[i];
    if (prof.files.length === 0) continue;
    
    console.log(`\n[${i+1}/${matchedProfs.length}] ${prof.profName} (${prof.files.length} files)`);
    
    for (const file of prof.files.slice(0, 5)) {  // Limit to 5 files per prof for bulk
      let result;
      try {
        result = await processFile(file, prof, tmpDir, prof);
      } catch (e) {
        if (e.message === 'PAUSE_NEEDED') {
          console.log('\n⚠️ PAUSE - Both services exhausted mid-file. Stopping.');
          fs.writeFileSync(PROGRESS_FILE, JSON.stringify({
            lastProfIdx: i - 1,  // Re-do this prof
            successCount, failCount,
            ilovepdf: tokenState.ilovepdf,
            convertapi: tokenState.convertapi,
          }));
          process.exit(0);
        }
        result = { success: false, fileName: file.name, error: e.message };
      }
      fs.writeSync(resultsOut, JSON.stringify(result) + '\n');
      
      if (result.success) successCount++;
      else failCount++;
      
      // Status log
      console.log(`  ${result.success ? '✓' : '✗'} [${result.conversionMethod || 'pdf'}] ${result.fileName} (${result.elapsed}s) | iLovePDF: ${tokenState.ilovepdf.remaining} | ConvertAPI: ${tokenState.convertapi.remaining}s`);
      
      if (!result.success) console.log(`      ERROR: ${result.error}`);
      
      // Save progress every iteration
      fs.writeFileSync(PROGRESS_FILE, JSON.stringify({
        lastProfIdx: i, successCount, failCount,
        ilovepdf: tokenState.ilovepdf,
        convertapi: tokenState.convertapi,
      }));
      
      await setTimeout(50);
    }
    
    // Check if both services are exhausted
    if (tokenState.ilovepdf.remaining <= 0 && tokenState.convertapi.remaining <= 0) {
      console.log(`\n⚠️ PAUSE - Both services exhausted at prof ${i+1}/${matchedProfs.length}`);
      console.log(`iLovePDF: ${tokenState.ilovepdf.remaining} remaining`);
      console.log(`ConvertAPI: ${tokenState.convertapi.remaining}s remaining`);
      console.log(`\nACTION REQUIRED: Upgrade iLovePDF or ConvertAPI to continue`);
      break;
    }
  }
  
  fs.closeSync(resultsOut);
  
  console.log(`\n=== DONE ===`);
  console.log(`Processed: ${processed}, Success: ${successCount}, Failed: ${failCount}`);
  console.log(`iLovePDF: ${tokenState.ilovepdf.files} converted`);
  console.log(`ConvertAPI: ${tokenState.convertapi.files} converted`);
  console.log(`LibreOffice: ${tokenState.libreoffice.files} converted`);
})();
