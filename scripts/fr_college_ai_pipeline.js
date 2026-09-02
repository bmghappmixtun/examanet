/**
 * Français Collège bulk AI pipeline (2026-08-09)
 * Same as lycée pipeline but for collège files (283 files)
 */
require('dotenv').config({ path: '/workspace/edutunisie/.env.local' });
const { PrismaClient } = require('/workspace/edutunisie/node_modules/@prisma/client');
const fs = require('fs');
const https = require('https');
const { spawnSync } = require('child_process');
const OpenAI = require('openai');

const prisma = new PrismaClient({ log: ['error'] });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const PROXY_URL = 'https://examanet.com/api/blob-teacher';
const INTERNAL_TOKEN = process.env.INTERNAL_BULK_TOKEN || 'devmanet-bulk-2026';

function safeLog(s) { return String(s).replace(/[\r\n\t]/g, ' ').substring(0, 200); }

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

function extractText(pdfBuffer) {
  const tmpFile = `/tmp/fr_${Date.now()}_${Math.random().toString(36).slice(2)}.pdf`;
  fs.writeFileSync(tmpFile, pdfBuffer);
  try {
    const out = spawnSync('python3', ['/tmp/extract_pdf.py', tmpFile, '6000'], {
      encoding: 'utf-8',
      maxBuffer: 50 * 1024 * 1024,
    });
    if (out.status !== 0) throw new Error(`extract failed`);
    return out.stdout;
  } finally {
    try { fs.unlinkSync(tmpFile); } catch {}
  }
}

async function analyzeWithOpenAI({ text, title, className, sectionName }) {
  const truncated = text.length > 4000 ? text.substring(0, 4000) : text;
  const prompt = `Analyse ce document de français (${className || ''} - ${sectionName || 'sans section'}) et génère les métadonnées en JSON strict:

TITRE: ${title}

EXTRAIT:
${truncated}

Champs:
- generalSubject: 2-5 mots décrivant le SUJET/TOPIC (ex: "le voyage initiatique"). PAS de "devoir" ou "synthèse".
- shortKeyPoints: 4-6 concepts courts de 2-3 mots (ex: "voyage initiatique", "quête identitaire"). Distincts de simples mots-clés.
- description: 1-2 phrases (max 250 chars) FACTUELLES.
- summary: 2-3 phrases.

JSON uniquement (pas de code fences):
{"generalSubject": "...", "shortKeyPoints": ["..."], "description": "...", "summary": "..."}`;

  const resp = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: 'Tu es un assistant pédagogique tunisien.' },
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
  return /corrig[ée]/i.test(title);
}

async function processOne(f) {
  const t0 = Date.now();
  const buf = await downloadFile(f.fileKey);
  const text = extractText(buf);
  if (text.length < 50) throw new Error(`No text extracted (${text.length} chars)`);
  const ai = await analyzeWithOpenAI({
    text, title: f.title,
    className: f.class?.nameFr, sectionName: f.section?.nameFr,
  });
  const hw = detectHomework(f.title);
  return {
    resourceId: f.id,
    generalSubject: ai.generalSubject,
    shortKeyPoints: ai.shortKeyPoints,
    description: ai.description,
    summary: ai.summary,
    homeworkSubtype: hw?.homeworkSubtype || f.homeworkSubtype || undefined,
    homeworkNumber: hw?.homeworkNumber || f.homeworkNumber || undefined,
    hasCorrection: f.hasCorrection || detectHasCorrection(f.title),
    modelUsed: 'gpt-4o-mini-v2-fr',
    _elapsedMs: Date.now() - t0,
  };
}

async function main() {
  const files = await prisma.resource.findMany({
    where: {
      status: 'PUBLISHED',
      subject: { slug: 'francais' },
      class: { level: { slug: 'college' } },
    },
    select: {
      id: true, numericId: true, slug: true, title: true, fileKey: true,
      fileSize: true, hasCorrection: true, homeworkSubtype: true, homeworkNumber: true,
      class: { select: { nameFr: true } },
      section: { select: { nameFr: true } },
    },
    orderBy: { numericId: 'asc' },
  });
  console.log(`Found ${files.length} FR collège files`);

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
      errors.push({ numericId: f.numericId, error: err.message.substring(0, 200) });
      console.log(`[${++done}/${files.length}] #${f.numericId} ERR: ${safeLog(err.message)}`);
    }
    if (done % 20 === 0) {
      fs.writeFileSync('/workspace/edutunisie/scripts/fr_college_payload.json',
        JSON.stringify({ payload, errors }, null, 2));
    }
  }

  fs.writeFileSync('/workspace/edutunisie/scripts/fr_college_payload.json',
    JSON.stringify({ payload, errors }, null, 2));
  console.log(`\nDONE: ${payload.length} success, ${errors.length} errors`);
  if (errors.length) {
    console.log('Errors:');
    errors.forEach(e => console.log(`  #${e.numericId}: ${e.error}`));
  }
  await prisma.$disconnect();
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
