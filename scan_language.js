/* eslint-disable */
// Content-based language scan: detects misclassified language files
// Usage: node scan_language.js [batch_size] [start_id]
//   - batch_size: how many resources to scan per batch (default 200)
//   - start_id: numericId to start from (default 0)
//
// Outputs JSONL of suspect files (one per line) to /tmp/scan_results.jsonl

require('/workspace/edutunisie/node_modules/dotenv').config({ path: '/workspace/edutunisie/.env.local' });
const { PrismaClient } = require('/workspace/edutunisie/node_modules/@prisma/client');
const { spawnSync } = require('child_process');
const fs = require('fs');

const p = new PrismaClient({ log: ['error'] });
const BATCH = parseInt(process.argv[2] || '200', 10);
const START_ID = parseInt(process.argv[3] || '0', 10);
const OUT_FILE = '/tmp/scan_results.jsonl';

// Mapping: detected language code → expected subject slug
// 3L Allemand/Italien/Espagnol are sub-subjects of 3eme-langue
// Français/Arabe are core subjects
const LANG_MAP = {
  fr: { subject: 'francais', label: 'fr' },
  ar: { subject: 'arabe', label: 'ar' },
  en: { subject: 'anglais', label: 'en' },
  de: { subject: '3eme-langue-allemand', label: 'de' },
  it: { subject: '3eme-langue-italien', label: 'it' },
  es: { subject: '3eme-langue-espagnol', label: 'es' },
};

function detectLanguage(text) {
  // Sample first 2000 chars (sufficient for langdetect)
  const sample = text.slice(0, 2000);
  try {
    const r = spawnSync('python3', [
      '-c',
      `from langdetect import detect; print(detect("""${sample.replace(/"/g, '\\"').slice(0, 1500)}"""))`
    ], { encoding: 'utf8', timeout: 8000 });
    const lang = (r.stdout || '').trim();
    if (['fr', 'en', 'ar', 'de', 'it', 'es'].includes(lang)) {
      return lang;
    }
    return null;
  } catch (e) {
    return null;
  }
}

(async () => {
  // Get all resources with fullText, in batches by numericId
  const total = await p.resource.count({ where: { status: 'PUBLISHED' } });
  console.log(`Total published: ${total}`);

  // Clear output file
  fs.writeFileSync(OUT_FILE, '');

  let scanned = 0;
  let suspects = 0;
  let langStats = {};
  let cursor = START_ID;
  const maxId = await p.resource.findFirst({
    where: { status: 'PUBLISHED' },
    orderBy: { numericId: 'desc' },
    select: { numericId: true },
  });
  const endId = maxId?.numericId || 0;
  console.log(`Scanning numericId ${cursor} to ${endId}, batch=${BATCH}`);

  while (cursor <= endId) {
    const batch = await p.resource.findMany({
      where: {
        status: 'PUBLISHED',
        numericId: { gte: cursor, lte: cursor + BATCH },
        content: { fullText: { not: null } },
      },
      select: {
        id: true,
        numericId: true,
        title: true,
        language: true,
        subject: { select: { slug: true, nameFr: true } },
        class: { select: { slug: true, nameFr: true } },
        content: { select: { fullText: true } },
      },
      orderBy: { numericId: 'asc' },
    });

    if (batch.length === 0) {
      cursor += BATCH;
      continue;
    }

    for (const r of batch) {
      const text = r.content?.fullText || '';
      if (text.length < 200) {
        scanned++;
        continue;
      }

      const detected = detectLanguage(text);
      langStats[detected || 'unknown'] = (langStats[detected || 'unknown'] || 0) + 1;

      if (detected && detected !== 'unknown') {
        const expected = LANG_MAP[detected];
        const currentLang = r.language || 'fr';
        const currentSubject = r.subject?.slug || '';
        const langMismatch = currentLang !== detected;
        const subjectMismatch = expected && currentSubject !== expected.subject;

        if (langMismatch || subjectMismatch) {
          suspects++;
          const out = {
            id: r.numericId,
            title: r.title,
            currentLanguage: currentLang,
            detectedLanguage: detected,
            currentSubject: currentSubject,
            expectedSubject: expected?.subject || '?',
            classSlug: r.class?.slug || '',
            textLen: text.length,
            langMismatch,
            subjectMismatch,
            snippet: text.slice(0, 200).replace(/\s+/g, ' '),
          };
          fs.appendFileSync(OUT_FILE, JSON.stringify(out) + '\n');
          console.log(`⚠️  #${r.numericId} [${currentLang}→${detected}] [${currentSubject}→${expected?.subject}] ${r.title?.slice(0, 60)}`);
        }
      }
      scanned++;
    }

    cursor += BATCH;
    process.stdout.write(`\r[${scanned}/${total}] scanned | ${suspects} suspects | ${JSON.stringify(langStats)}`);
  }

  console.log(`\n\n=== DONE ===`);
  console.log(`Total scanned: ${scanned}`);
  console.log(`Suspects: ${suspects}`);
  console.log(`Lang stats: ${JSON.stringify(langStats)}`);
  console.log(`Results: ${OUT_FILE}`);

  await p.$disconnect();
})();
