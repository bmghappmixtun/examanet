require('dotenv').config({ path: '/workspace/edutunisie/.env.local' });
const { PrismaClient } = require('/workspace/edutunisie/node_modules/@prisma/client');
const fs = require('fs');
const https = require('https');
const { execSync } = require('child_process');
const OpenAI = require('openai');

const prisma = new PrismaClient({ log: ['error'] });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const PROXY_URL = 'https://examanet.com/api/blob-teacher';
const INTERNAL_TOKEN = process.env.INTERNAL_BULK_TOKEN || 'devmanet-bulk-2026';

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

(async () => {
  const f = await prisma.resource.findFirst({
    where: { numericId: 7921 },
    select: { fileKey: true, title: true, class: { select: { nameFr: true } }, section: { select: { nameFr: true } } },
  });
  console.log('Downloading:', f.fileKey);
  const t0 = Date.now();
  const buf = await downloadFile(f.fileKey);
  console.log(`Downloaded ${buf.length} bytes in ${Date.now() - t0}ms`);
  
  const tmpFile = '/tmp/test_7921.pdf';
  fs.writeFileSync(tmpFile, buf);
  const text = execSync(`python3 /tmp/extract_pdf.py ${tmpFile} 6000`, { encoding: 'utf-8' });
  console.log('Extracted text length:', text.length);
  console.log('First 500 chars:', text.substring(0, 500));
  
  // Call OpenAI
  const resp = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: 'Tu es un assistant pédagogique tunisien. Tu analyses des documents scolaires et génères des métadonnées structurées en JSON.' },
      { role: 'user', content: `Analyse ce devoir de français (${f.class?.nameFr} - ${f.section?.nameFr || 'sans section'}) et génère les métadonnées suivantes en JSON strict:

TITRE: ${f.title}

TEXTE (extrait):
${text}

Génère:
- "generalSubject": 2-5 mots décrivant le SUJET/TOPIC principal
- "shortKeyPoints": 4-6 concepts courts de 2-3 mots
- "description": 1-2 phrases (max 250 chars) décrivant factuellement le contenu
- "summary": 2-3 phrases résumant le document

JSON uniquement.` }
    ],
    temperature: 0.3,
    max_tokens: 600,
  });
  console.log('\n=== AI response ===');
  console.log(resp.choices[0].message.content);
  
  await prisma.$disconnect();
})();
