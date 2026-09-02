/**
 * FR Lycée Text Audit (2026-08-10)
 *
 * Downloads all 119 FR lycée PDFs, extracts text (pdfplumber + tesseract OCR),
 * and searches for keywords to validate / discover:
 *
 * - "corrigé", "correction", "DC" → hasCorrection status
 * - "Lycée pilote", "Collège pilote" → schoolType validation
 * - Section keywords (Sciences, Lettres, Maths, etc.) → sectionId validation
 * - Teacher name (from DB) → cross-check with what's in the doc
 * - School name (if mentioned)
 *
 * Output: /tmp/fr_lycee_text_audit.json + console summary
 */

require('dotenv').config({ path: '/workspace/edutunisie/.env.local' });
const { PrismaClient } = require('/workspace/edutunisie/node_modules/@prisma/client');
const fs = require('fs');
const path = require('path');
const https = require('https');
const { spawnSync } = require('child_process');

const prisma = new PrismaClient({ log: ['error'] });
const PROXY_URL = 'https://examanet.com/api/blob-teacher';
const INTERNAL_TOKEN = process.env.INTERNAL_BULK_TOKEN || 'devmanet-bulk-2026';

// Text extraction (reuses the same logic from /tmp/extract_pdf.py)
function extractText(pdfBuffer) {
  const tmpFile = `/tmp/fr_audit_${Date.now()}_${Math.random().toString(36).slice(2)}.pdf`;
  fs.writeFileSync(tmpFile, pdfBuffer);
  try {
    const out = spawnSync('python3', ['/tmp/extract_pdf.py', tmpFile, '12000'], {
      encoding: 'utf-8',
      maxBuffer: 50 * 1024 * 1024,
    });
    if (out.status !== 0) return { text: '', method: 'failed' };
    // Heuristic: if length > 200, was text-based; else was OCR
    return {
      text: out.stdout,
      method: out.stdout.length > 200 ? 'pdfplumber' : 'ocr',
    };
  } finally {
    try { fs.unlinkSync(tmpFile); } catch {}
  }
}

async function downloadFile(fileKey) {
  const url = `${PROXY_URL}/${fileKey}`;
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'x-internal-token': INTERNAL_TOKEN } }, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    });
    req.on('error', reject);
    req.setTimeout(60000, () => req.destroy(new Error('timeout')));
  });
}

// === DETECTION FUNCTIONS ===

// Detect corrigé in text
function detectCorrige(text) {
  const patterns = [
    /Corrig[ée]\b/i,
    /[Cc]orrection\s+du\s+devoir/i,
    /^DC\s/i, // DC prefix
    /Eléments?\s+de\s+[Cc]orrection/i,
    /Barème\s+et\s+[Cc]orrection/i,
  ];
  for (const p of patterns) {
    if (p.test(text)) return p.source;
  }
  return null;
}

// Detect school type in text
function detectSchoolType(text) {
  // Look in first 1000 chars (header area usually)
  const head = text.substring(0, 1500);
  if (/Lycée\s+Pilote/i.test(head)) return 'PILOTE';
  if (/Collège\s+Pilote/i.test(head)) return 'PILOTE_COLLEGE'; // should never be in lycée files
  // Look for specific lycée pilote names
  const PILOTE_NAMES = [
    /Lycée\s+Pilote\s+Bourguiba/i,
    /Lycée\s+Pilote\s+Sadiki/i,
    /Lycée\s+Pilote\s+Mednine/i,
    /Lycée\s+Pilote\s+Sfax/i,
    /Lycée\s+Pilote\s+[A-Z][a-zé]+\b/i, // generic pattern
  ];
  for (const p of PILOTE_NAMES) {
    if (p.test(head)) return 'PILOTE_NAMED';
  }
  return null;
}

// Detect section in text
function detectSection(text) {
  const head = text.substring(0, 2000);
  if (/Sciences\s+Exp[ée]rimentales/i.test(head)) return 'Sciences Expérimentales';
  if (/Section\s+Sciences\s+Exp[ée]rimentales/i.test(head)) return 'Sciences Expérimentales';
  if (/\bLettres\b/i.test(head)) return 'Lettres';
  if (/Section\s+Lettres/i.test(head)) return 'Lettres';
  if (/Math[ée]matiques/i.test(head)) return 'Mathématiques';
  if (/Section\s+Math/i.test(head)) return 'Mathématiques';
  if (/Technique/i.test(head)) return 'Technique';
  if (/Économie\s+et\s+Services/i.test(head)) return 'Économie et services';
  if (/Économie-Gestion/i.test(head)) return 'Économie-Gestion';
  if (/Sciences\s+de\s+l['']informatique/i.test(head)) return 'Sciences de l\'informatique';
  if (/Technologies\s+de\s+l['']informatique/i.test(head)) return 'Technologies de l\'informatique';
  if (/\bSciences\b/i.test(head) && !/Sciences\s+Exp/i.test(head)) return 'Sciences';
  return null;
}

// Detect class level (1AS, 2AS, 3AS, Bac)
function detectClass(text) {
  const head = text.substring(0, 1500);
  // Try to find class info in header
  const classPatterns = [
    [/1[èe]re\s+AS|1[èe]re\s+Ann[ée]e/i, '1ère AS'],
    [/2[èe]me\s+AS|2[èe]me\s+Ann[ée]e/i, '2ème AS'],
    [/3[èe]me\s+AS|3[èe]me\s+Ann[ée]e/i, '3ème AS'],
    [/Bac|4[èe]me\s+Ann[ée]e/i, 'Bac'],
  ];
  for (const [p, label] of classPatterns) {
    if (p.test(head)) return label;
  }
  return null;
}

// Detect school name in text
function detectSchoolName(text) {
  const head = text.substring(0, 2000);
  const SCHOOL_PATTERNS = [
    /Lycée\s+([^,\n\r]{3,60})/i,
    /Collège\s+([^,\n\r]{3,60})/i,
    /École\s+([^,\n\r]{3,60})/i,
    /Lycée\s+Secondaire\s+([^,\n\r]{3,60})/i,
  ];
  for (const p of SCHOOL_PATTERNS) {
    const m = head.match(p);
    if (m && m[1]) {
      const name = m[1].trim().replace(/\s+/g, ' ');
      // Filter out garbage matches
      if (name.length < 3 || name.length > 80) continue;
      if (/pilote|secondaire/i.test(name)) continue; // too generic
      return name;
    }
  }
  return null;
}

// Detect year
function detectYear(text) {
  const m = text.match(/(\d{4})[-\/–](\d{4})/);
  if (m) return `${m[1]}-${m[2]}`;
  return null;
}

// Detect teacher name in text (cross-check with DB)
function detectTeacherInText(text, teacher) {
  if (!teacher || (!teacher.firstName && !teacher.lastName)) return { found: false };
  const head = text.substring(0, 3000);
  const fn = teacher.firstName || '';
  const ln = teacher.lastName || '';
  // Try various combos
  if (fn && head.includes(fn)) return { found: true, match: 'firstName', name: fn };
  if (ln && ln !== '—' && head.includes(ln)) return { found: true, match: 'lastName', name: ln };
  if (fn && ln && head.includes(`${fn} ${ln}`)) return { found: true, match: 'fullName', name: `${fn} ${ln}` };
  return { found: false };
}

async function main() {
  const files = await prisma.resource.findMany({
    where: {
      status: 'PUBLISHED',
      subject: { slug: 'francais' },
      class: { level: { slug: 'lycee' } },
    },
    select: {
      id: true, numericId: true, title: true, fileKey: true,
      fileSize: true,
      schoolType: true, hasCorrection: true,
      class: { select: { nameFr: true, slug: true } },
      section: { select: { nameFr: true, slug: true } },
      teacher: { select: { firstName: true, lastName: true } },
    },
    orderBy: { numericId: 'asc' },
  });
  console.log(`\n=== TEXT AUDIT: ${files.length} FR lycée files ===\n`);

  const results = [];
  let done = 0;
  const startTime = Date.now();

  for (const f of files) {
    try {
      const buf = await downloadFile(f.fileKey);
      const { text, method } = extractText(buf);
      const t0 = Date.now();
      const head = text.substring(0, 2000);
      
      const corrigeInText = detectCorrige(head);
      const stInText = detectSchoolType(head);
      const secInText = detectSection(head);
      const classInText = detectClass(head);
      const schoolInText = detectSchoolName(head);
      const yearInText = detectYear(head);
      const teacherInText = detectTeacherInText(head, f.teacher);
      
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
      
      // Build findings
      const findings = [];
      
      // 1. Corrigé in text
      if (corrigeInText) {
        findings.push(`✓ "corrigé" trouvé dans le texte (pattern: ${corrigeInText})`);
      }
      
      // 2. School type validation
      if (stInText === 'PILOTE' && f.schoolType !== 'PILOTE') {
        findings.push(`⚠️ Texte dit "Lycée pilote" mais DB dit ${f.schoolType}`);
      }
      if (stInText === 'PILOTE_NAMED' && f.schoolType !== 'PILOTE') {
        findings.push(`✓ École pilote nommée dans le texte, DB confirme PILOTE=${f.schoolType === 'PILOTE'}`);
      }
      if (!stInText && f.schoolType === 'PILOTE') {
        findings.push(`? DB=PILOTE mais pas de mention "Lycée pilote" dans le texte (probablement OK si prof est à un lycée pilote)`);
      }
      
      // 3. Section validation
      if (secInText && f.section && f.section.nameFr.toLowerCase() !== secInText.toLowerCase()) {
        findings.push(`⚠️ Section texte="${secInText}" vs DB="${f.section.nameFr}"`);
      }
      
      // 4. School name discovered (not in DB)
      if (schoolInText) {
        findings.push(`ℹ️ École détectée: "${schoolInText}"`);
      }
      
      // 5. Teacher in text
      if (teacherInText.found) {
        findings.push(`✓ Prof "${teacherInText.name}" trouvé dans le texte (${teacherInText.match})`);
      }
      
      // Print
      console.log(`[${++done}/${files.length}] #${f.numericId} [${method}, ${elapsed}s, ${text.length} chars]`);
      if (findings.length > 0) {
        findings.forEach(fnd => console.log(`    ${fnd}`));
      } else {
        console.log(`    (no notable findings)`);
      }
      
      results.push({
        numericId: f.numericId,
        fileKey: f.fileKey,
        title: f.title,
        db: {
          schoolType: f.schoolType,
          hasCorrection: f.hasCorrection,
          section: f.section?.nameFr,
          class: f.class?.nameFr,
          teacher: f.teacher,
        },
        text: {
          method,
          length: text.length,
          corrigePattern: corrigeInText,
          schoolTypeInText: stInText,
          sectionInText: secInText,
          classInText: classInText,
          schoolNameInText: schoolInText,
          yearInText: yearInText,
          teacherInText: teacherInText.found ? teacherInText.name : null,
        },
        findings,
      });
      
      // Save every 20
      if (done % 20 === 0) {
        fs.writeFileSync('/tmp/fr_lycee_text_audit.json', JSON.stringify(results, null, 2));
      }
    } catch (err) {
      console.log(`[${++done}/${files.length}] #${f.numericId} ERR: ${err.message.substring(0, 100)}`);
      results.push({ numericId: f.numericId, error: err.message });
    }
  }
  
  // Final save
  fs.writeFileSync('/tmp/fr_lycee_text_audit.json', JSON.stringify(results, null, 2));
  console.log(`\n✓ Saved ${results.length} results to /tmp/fr_lycee_text_audit.json`);
  
  // Summary
  const withFindings = results.filter(r => r.findings && r.findings.length > 0);
  console.log(`\n=== SUMMARY ===`);
  console.log(`Files with findings: ${withFindings.length}/${results.length}`);
  
  const corrigeInText = results.filter(r => r.text?.corrigePattern).length;
  const stMismatch = results.filter(r => r.findings?.some(f => f.includes('⚠️ Texte dit'))).length;
  const sectionMismatch = results.filter(r => r.findings?.some(f => f.includes('Section texte'))).length;
  const schoolDetected = results.filter(r => r.text?.schoolNameInText).length;
  const teacherFound = results.filter(r => r.text?.teacherInText).length;
  
  console.log(`  Corrigé trouvé dans texte: ${corrigeInText}`);
  console.log(`  SchoolType mismatch: ${stMismatch}`);
  console.log(`  Section mismatch: ${sectionMismatch}`);
  console.log(`  École nommée détectée: ${schoolDetected}`);
  console.log(`  Prof trouvé dans texte: ${teacherFound}`);
  
  await prisma.$disconnect();
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
