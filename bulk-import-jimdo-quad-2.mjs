import fs from 'fs';
import { setTimeout } from 'timers/promises';

const SEED_TOKEN = 'cffa7e495ff6a441d253b03b8cf1efa7';
const QUAD_ID = 2;

async function downloadFile(url, maxRedirects = 8) {
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

function parseTitle(title) {
  const result = {
    type: 'HOMEWORK', homeworkSubtype: 'CONTROLE', homeworkNumber: 1,
    subjectSlug: 'mathematiques', classSlug: '1ere-secondaire', schoolType: 'LYCEE',
    trimester: '1', year: '2024-2025', hasCorrection: false, language: 'fr',
  };
  
  const yearMatch = title.match(/\((\d{4})[/-](\d{4})\)/);
  if (yearMatch) result.year = `${yearMatch[1]}-${yearMatch[2]}`;
  
  if (/math/i.test(title)) result.subjectSlug = 'mathematiques';
  else if (/physique|phys/i.test(title)) result.subjectSlug = 'physique';
  else if (/techno/i.test(title)) result.subjectSlug = 'technologie';
  else if (/svt|sv|tic/i.test(title)) result.subjectSlug = 'svt';
  else if (/fran[cç]ais/i.test(title)) result.subjectSlug = 'francais';
  else if (/arabe/i.test(title)) result.subjectSlug = 'arabe';
  else if (/anglais/i.test(title)) result.subjectSlug = 'anglais';
  else if (/histoire/i.test(title)) result.subjectSlug = 'histoire';
  else if (/g[eé]o/i.test(title)) result.subjectSlug = 'geographie';
  else if (/philo/i.test(title)) result.subjectSlug = 'philosophie';
  else if (/eco/i.test(title)) result.subjectSlug = 'economie';
  
  if (/bac/i.test(title)) result.classSlug = '4eme-secondaire';
  else if (/1[eè]re/i.test(title)) result.classSlug = '1ere-secondaire';
  else if (/2[eè]me/i.test(title)) result.classSlug = '2eme-secondaire';
  else if (/3[eè]me/i.test(title)) result.classSlug = '3eme-secondaire';
  else if (/4[eè]me/i.test(title)) result.classSlug = '4eme-secondaire';
  
  if (/synth[eè]se/i.test(title)) result.homeworkSubtype = 'SYNTHESE';
  else if (/contr[oô]le/i.test(title)) result.homeworkSubtype = 'CONTROLE';
  else if (/examen/i.test(title)) result.homeworkSubtype = 'EXAMEN';
  
  const numMatch = title.match(/N[°o]?\s*(\d+)/i);
  if (numMatch) result.homeworkNumber = parseInt(numMatch[1]);
  if (/corr/i.test(title)) result.hasCorrection = true;
  
  return result;
}

(async () => {
  const allFiles = fs.readFileSync('/workspace/docs/devoirat/word-files-batch31-quad-2.jsonl', 'utf8')
    .trim().split('\n').map(l => JSON.parse(l));
  
  console.log(`=== QUAD 2: ${allFiles.length} files ===`);
  
  const PROGRESS_FILE = '/workspace/docs/devoirat/bulk-jimdo-quad-2-progress.json';
  const RESULTS_FILE = '/workspace/docs/devoirat/bulk-jimdo-quad-2-results.jsonl';
  
  let startIdx = 0;
  let successCount = 0;
  let failCount = 0;
  
  try {
    const prog = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
    startIdx = prog.lastFileIdx || 0;
    successCount = prog.successCount || 0;
    failCount = prog.failCount || 0;
    console.log(`[Resume] idx=${startIdx}, success=${successCount}, fail=${failCount}`);
  } catch (e) {}
  
  const resultsOut = fs.openSync(RESULTS_FILE, 'a');
  
  for (let i = startIdx; i < allFiles.length; i++) {
    const file = allFiles[i];
    const start = Date.now();
    
    try {
      const buffer = await downloadFile(file.pdfUrl);
      const parsed = parseTitle(file.title);
      
      const metadata = {
        fileId: `jimdo-quad2-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        teacherName: file.profName,
        originalFormat: null,
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
      
      const result = await uploadToExamanet(buffer, metadata);
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      
      if (result.success) {
        successCount++;
        fs.writeSync(resultsOut, JSON.stringify({
          success: true, prof: file.profName, fileName: file.title,
          publicUrl: result.fileUrl, teacherId: result.teacherId,
          elapsed, idx: i, quad: QUAD_ID,
        }) + '\n');
      } else {
        failCount++;
        fs.writeSync(resultsOut, JSON.stringify({
          success: false, prof: file.profName, fileName: file.title,
          error: result.error, elapsed, idx: i, quad: QUAD_ID,
        }) + '\n');
      }
      
      if (i % 50 === 0) {
        console.log(`[Q2 ${i}/${allFiles.length}] S:${successCount} F:${failCount} | ${result.success ? '✓' : '✗'} ${file.profName} (${elapsed}s)`);
      }
      
      if (i % 20 === 0) {
        fs.writeFileSync(PROGRESS_FILE, JSON.stringify({
          lastFileIdx: i + 1, successCount, failCount,
        }));
      }
      
      await setTimeout(30);
    } catch (e) {
      failCount++;
      fs.writeSync(resultsOut, JSON.stringify({
        success: false, prof: file.profName, fileName: file.title,
        error: e.message, idx: i, quad: QUAD_ID,
      }) + '\n');
      
      if (i % 50 === 0) console.log(`[Q2 ${i}/${allFiles.length}] ✗ ${e.message.slice(0, 60)}`);
      
      fs.writeFileSync(PROGRESS_FILE, JSON.stringify({
        lastFileIdx: i + 1, successCount, failCount,
      }));
    }
  }
  
  fs.closeSync(resultsOut);
  
  console.log(`\n=== Q2 DONE ===`);
  console.log(`Success: ${successCount}, Failed: ${failCount}`);
})();
