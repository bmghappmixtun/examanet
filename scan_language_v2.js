/* eslint-disable */
// Content-based language scan v2: more conservative logic
// Identifies 3 categories of misclassified files:
// 1. language='fr' but content is de/it/es (should be 3L subject + correct lang)
// 2. language='fr' but content is en (should be Anglais subject)
// 3. language='fr' but content is ar (should have language='ar', subject stays)
// 4. language in [de/it/es/en] but content is actually fr (subject was wrongly 3L/En)
//
// Usage: node scan_language_v2.js [batch_size] [start_id]

require('/workspace/edutunisie/node_modules/dotenv').config({ path: '/workspace/edutunisie/.env.local' });
const { PrismaClient } = require('/workspace/edutunisie/node_modules/@prisma/client');
const { spawnSync } = require('child_process');
const fs = require('fs');

const p = new PrismaClient({ log: ['error'] });
const BATCH = parseInt(process.argv[2] || '500', 10);
const START_ID = parseInt(process.argv[3] || '0', 10);
const OUT_FILE = '/tmp/scan_v2.jsonl';

const LANG_SUBJECT = {
  de: '3eme-langue-allemand',
  it: '3eme-langue-italien',
  es: '3eme-langue-espagnol',
  en: 'anglais',
  ar: null, // AR can be in any subject (maths, svt, etc.)
  fr: null, // FR can be in any subject
};

function detectLanguage(text) {
  const sample = text.slice(0, 2000);
  try {
    const r = spawnSync('python3', [
      '-c',
      `from langdetect import detect; print(detect("""${sample.replace(/"/g, '\\"').slice(0, 1500)}"""))`,
    ], { encoding: 'utf8', timeout: 8000 });
    const lang = (r.stdout || '').trim();
    if (['fr', 'en', 'ar', 'de', 'it', 'es'].includes(lang)) return lang;
    return null;
  } catch (e) {
    return null;
  }
}

function classify(out) {
  const { currentLanguage, detectedLanguage, currentSubject } = out;
  // Mismatch if current language != detected
  if (currentLanguage === detectedLanguage) return null;

  // Case 1: de/it/es in subject but content is fr → 3L files that are actually FR
  if (['de', 'it', 'es'].includes(detectedLanguage) && currentLanguage === 'fr') {
    return {
      severity: 'HIGH',
      action: 'migrate_subject',
      reason: `Content is ${detectedLanguage}, should be in 3L ${detectedLanguage} subject`,
      targetSubject: LANG_SUBJECT[detectedLanguage],
      newLanguage: detectedLanguage,
    };
  }
  // Case 2: en in subject but content is fr → Anglais files that are FR
  if (detectedLanguage === 'en' && currentLanguage === 'fr') {
    return {
      severity: 'HIGH',
      action: 'migrate_subject',
      reason: 'Content is English, should be in Anglais subject',
      targetSubject: 'anglais',
      newLanguage: 'en',
    };
  }
  // Case 3: content is fr but language tag is de/it/es/en → 3L files that are FR
  if (['de', 'it', 'es', 'en'].includes(currentLanguage) && detectedLanguage === 'fr') {
    return {
      severity: 'HIGH',
      action: 'migrate_subject',
      reason: `Content is fr, but tagged as ${currentLanguage} - should be in canonical subject`,
      targetSubject: null, // depends on actual subject
      newLanguage: 'fr',
    };
  }
  // Case 4: tagged fr but content is ar → just fix language tag
  if (detectedLanguage === 'ar' && currentLanguage === 'fr') {
    return {
      severity: 'LOW',
      action: 'fix_language',
      reason: 'Content is AR, only language tag needs fix (subject may be correct)',
      targetSubject: currentSubject, // keep
      newLanguage: 'ar',
    };
  }
  // Case 5: tagged ar but content is fr
  if (currentLanguage === 'ar' && detectedLanguage === 'fr') {
    return {
      severity: 'MEDIUM',
      action: 'fix_language',
      reason: 'Content is fr but tagged as ar',
      targetSubject: currentSubject,
      newLanguage: 'fr',
    };
  }
  return null;
}

(async () => {
  const total = await p.resource.count({ where: { status: 'PUBLISHED' } });
  console.log(`Total published: ${total}`);

  fs.writeFileSync(OUT_FILE, '');

  let scanned = 0;
  let byCategory = { HIGH: 0, MEDIUM: 0, LOW: 0, none: 0 };
  let byDetected = {};
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
      if (text.length < 300) {
        scanned++;
        continue;
      }

      const detected = detectLanguage(text);
      if (detected) byDetected[detected] = (byDetected[detected] || 0) + 1;

      if (detected && detected !== 'unknown') {
        const out = {
          id: r.numericId,
          title: r.title,
          currentLanguage: r.language || 'fr',
          detectedLanguage: detected,
          currentSubject: r.subject?.slug || '',
          classSlug: r.class?.slug || '',
          textLen: text.length,
        };
        const cls = classify(out);
        if (cls) {
          out.severity = cls.severity;
          out.action = cls.action;
          out.reason = cls.reason;
          out.targetSubject = cls.targetSubject;
          out.newLanguage = cls.newLanguage;
          out.snippet = text.slice(0, 200).replace(/\s+/g, ' ');
          byCategory[cls.severity] = (byCategory[cls.severity] || 0) + 1;
          fs.appendFileSync(OUT_FILE, JSON.stringify(out) + '\n');
        } else {
          byCategory.none = (byCategory.none || 0) + 1;
        }
      }
      scanned++;
    }

    cursor += BATCH;
    process.stdout.write(
      `\r[${scanned}/${total}] scanned | HIGH=${byCategory.HIGH || 0} MED=${byCategory.MEDIUM || 0} LOW=${byCategory.LOW || 0} | ${JSON.stringify(byDetected)}`
    );
  }

  console.log(`\n\n=== DONE ===`);
  console.log(`Total scanned: ${scanned}`);
  console.log(`By category: ${JSON.stringify(byCategory)}`);
  console.log(`By detected: ${JSON.stringify(byDetected)}`);
  console.log(`Results: ${OUT_FILE}`);

  await p.$disconnect();
})();
