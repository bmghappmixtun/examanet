/**
 * Français Lycée bulk AI pipeline (2026-08-09)
 *
 * For each FR lycée file:
 * 1. Download PDF via internal blob proxy
 * 2. Extract text (pdfplumber first, tesseract OCR fallback for scanned PDFs)
 * 3. Call OpenAI gpt-4o-mini to generate: generalSubject, shortKeyPoints, description, summary
 * 4. Detect hasCorrection via filename heuristics
 * 5. Detect homeworkSubtype + homeworkNumber from title
 * 6. Build a bulk payload for /api/admin/update-3l-metadata
 *
 * Outputs: scripts/fr_lycee_payload.json (bulk update payload + errors)
 */

require('dotenv').config({ path: '/workspace/edutunisie/.env.local' });
const { PrismaClient } = require('/workspace/edutunisie/node_modules/@prisma/client');
const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync, spawnSync } = require('child_process');
const OpenAI = require('openai');

const prisma = new PrismaClient({ log: ['error'] });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const PROXY_URL = 'https://examanet.com/api/blob-teacher';
const INTERNAL_TOKEN = process.env.INTERNAL_BULK_TOKEN || 'devmanet-bulk-2026';
const FR_SUBJECT_ID = 'cmqi8nr36002c2n4az2gqcsm7';

// HTML-escape helper to make safe log
function safeLog(s) { return String(s).replace(/[\r\n\t]/g, ' ').substring(0, 200); }

async function downloadFile(fileKey) {
  const url = `${PROXY_URL}/${fileKey}`;
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'x-internal-token': INTERNAL_TOKEN } }, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} for ${url}`));
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

function extractText(pdfBuffer) {
  const tmpFile = `/tmp/fr_${Date.now()}_${Math.random().toString(36).slice(2)}.pdf`;
  fs.writeFileSync(tmpFile, pdfBuffer);
  try {
    const out = spawnSync('python3', ['/tmp/extract_pdf.py', tmpFile, '6000'], {
      encoding: 'utf-8',
      maxBuffer: 50 * 1024 * 1024,
    });
    if (out.status !== 0) {
      throw new Error(`extract failed: ${out.stderr.substring(0, 200)}`);
    }
    return out.stdout;
  } finally {
    try { fs.unlinkSync(tmpFile); } catch {}
  }
}

async function analyzeWithOpenAI({ text, title, className, sectionName }) {
  // Truncate text aggressively to fit in the prompt budget
  const truncated = text.length > 4000 ? text.substring(0, 4000) : text;
  const prompt = `Analyse ce document de français (${className || ''} - ${sectionName || 'sans section'}) et génère les métadonnées en JSON strict:

TITRE: ${title}

EXTRAIT DU TEXTE:
${truncated}

Champs à générer (en français):
- generalSubject: 2-5 mots décrivant le SUJET/TOPIC principal (ex: "le voyage initiatique", "l'engagement politique", "les relations familiales"). PAS de "devoir" ou "synthèse".
- shortKeyPoints: 4-6 concepts courts de 2-3 mots chacun (ex: "voyage initiatique", "quête identitaire", "engagement politique"). Distincts de simples mots-clés.
- description: 1-2 phrases (max 250 chars) décrivant FACTUELLEMENT le contenu. Ne JAMAIS refuser.
- summary: 2-3 phrases résumant le document.

Réponds UNIQUEMENT en JSON valide (pas de code fences):
{"generalSubject": "...", "shortKeyPoints": ["...", "..."], "description": "...", "summary": "..."}`;

  const resp = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: 'Tu es un assistant pédagogique tunisien. Tu analyses des documents scolaires et génères des métadonnées structurées en JSON.' },
      { role: 'user', content: prompt },
    ],
    temperature: 0.3,
    max_tokens: 600,
  });
  const content = resp.choices[0].message.content.trim();
  const json = content.replace(/^```json\n?/, '').replace(/\n?```$/, '').trim();
  return JSON.parse(json);
}

function detectHomework(title) {
  const t = title.toLowerCase();
  let subtype = null;
  if (/synth[èe]se/.test(t)) subtype = 'synthese';
  else if (/contr[ôo]le/.test(t)) subtype = 'controle';
  if (!subtype) return null;
  const numMatch = title.match(/N°\s*(\d+)/i) || title.match(/n\s*(\d+)/i);
  return { homeworkSubtype: subtype, homeworkNumber: numMatch ? parseInt(numMatch[1], 10) : null };
}

function detectHasCorrection(title) {
  if (/corrig[ée]/i.test(title)) return true;
  return false;
}

async function processOne(f) {
  const t0 = Date.now();
  // Download
  const buf = await downloadFile(f.fileKey);
  // Extract
  const text = extractText(buf);
  if (text.length < 50) {
    throw new Error(`No text extracted (${text.length} chars) — file likely image-only or encrypted`);
  }
  // AI
  const ai = await analyzeWithOpenAI({
    text,
    title: f.title,
    className: f.class?.nameFr,
    sectionName: f.section?.nameFr,
  });
  const hw = detectHomework(f.title);
  const hasCorr = f.hasCorrection || detectHasCorrection(f.title);
  return {
    resourceId: f.id,
    generalSubject: ai.generalSubject,
    shortKeyPoints: ai.shortKeyPoints,
    description: ai.description,
    summary: ai.summary,
    homeworkSubtype: hw?.homeworkSubtype || f.homeworkSubtype || undefined,
    homeworkNumber: hw?.homeworkNumber || f.homeworkNumber || undefined,
    hasCorrection: hasCorr,
    modelUsed: 'gpt-4o-mini-v2-fr',
    _elapsedMs: Date.now() - t0,
  };
}

async function main() {
  // Get all FR lycée files
  const files = await prisma.resource.findMany({
    where: {
      status: 'PUBLISHED',
      subject: { slug: 'francais' },
      class: { level: { slug: 'lycee' } },
    },
    select: {
      id: true, numericId: true, slug: true, title: true, fileKey: true,
      fileSize: true, pageCount: true, hasCorrection: true,
      homeworkSubtype: true, homeworkNumber: true,
      class: { select: { nameFr: true } },
      section: { select: { nameFr: true } },
      teacher: { select: { firstName: true, lastName: true } },
    },
    orderBy: { numericId: 'asc' },
  });
  console.log(`Found ${files.length} FR lycée files`);

  const payload = [];
  const errors = [];
  let done = 0;
  const startTime = Date.now();

  for (const f of files) {
    try {
      const result = await processOne(f);
      payload.push(result);
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
      console.log(`[${++done}/${files.length}] #${f.numericId} OK (${result._elapsedMs}ms, total ${elapsed}s) — ${safeLog(result.generalSubject)}`);
    } catch (err) {
      errors.push({ numericId: f.numericId, fileKey: f.fileKey, error: err.message.substring(0, 200) });
      console.log(`[${++done}/${files.length}] #${f.numericId} ERR: ${safeLog(err.message)}`);
    }
    
    // Save incrementally every 10 files
    if (done % 10 === 0) {
      const outFile = '/workspace/edutunisie/scripts/fr_lycee_payload.json';
      fs.writeFileSync(outFile, JSON.stringify({ payload, errors, count: payload.length }, null, 2));
    }
  }

  // Final save
  const outFile = '/workspace/edutunisie/scripts/fr_lycee_payload.json';
  fs.writeFileSync(outFile, JSON.stringify({ payload, errors, count: payload.length }, null, 2));
  console.log(`\n=== DONE ===`);
  console.log(`Success: ${payload.length}`);
  console.log(`Errors: ${errors.length}`);
  console.log(`Saved to ${outFile}`);
  if (errors.length) {
    console.log('\nErrors:');
    errors.forEach(e => console.log(`  #${e.numericId}: ${e.error}`));
  }

  await prisma.$disconnect();
}

main().catch(e => {
  console.error('FATAL:', e);
  process.exit(1);
});
