/* eslint-disable */
// Fast language scan: batches 500 files into Python for processing
// Total: ~15k files. Python batch = ~30 calls. Each batch ~5-10 sec.
// Total time: ~5 min instead of 6+ hours.

require('/workspace/edutunisie/node_modules/dotenv').config({ path: '/workspace/edutunisie/.env.local' });
const { PrismaClient } = require('/workspace/edutunisie/node_modules/@prisma/client');
const { spawnSync } = require('child_process');
const fs = require('fs');

const p = new PrismaClient({ log: ['error'] });
const BATCH = parseInt(process.argv[2] || '500', 10);
const OUT_FILE = '/tmp/scan_v3.jsonl';
const PY_SCRIPT = '/tmp/lang_scan.py';

(async () => {
  const total = await p.resource.count({ where: { status: 'PUBLISHED' } });
  console.log(`Total published: ${total}`);

  fs.writeFileSync(OUT_FILE, '');

  let scanned = 0;
  let byCategory = { HIGH: 0, MEDIUM: 0, LOW: 0 };
  let byDetected = {};
  let cursor = 0;

  // Get max id
  const maxIdRow = await p.resource.findFirst({
    where: { status: 'PUBLISHED' },
    orderBy: { numericId: 'desc' },
    select: { numericId: true },
  });
  const endId = maxIdRow?.numericId || 0;
  console.log(`Scanning 0 to ${endId}, batch=${BATCH}`);

  while (cursor <= endId) {
    const batch = await p.resource.findMany({
      where: {
        status: 'PUBLISHED',
        numericId: { gte: cursor, lt: cursor + BATCH },
        content: { fullText: { not: null } },
      },
      select: {
        numericId: true,
        title: true,
        language: true,
        subject: { select: { slug: true } },
        class: { select: { slug: true } },
        content: { select: { fullText: true } },
      },
      orderBy: { numericId: 'asc' },
    });

    if (batch.length > 0) {
      // Prepare input for Python
      const input = batch.map((r) => ({
        id: r.numericId,
        title: r.title,
        currentLang: r.language || 'fr',
        currentSubject: r.subject?.slug || '',
        classSlug: r.class?.slug || '',
        textLen: r.content?.fullText?.length || 0,
        text: r.content?.fullText || '',
      }));

      // Call Python
      const r = spawnSync('python3', [PY_SCRIPT], {
        input: JSON.stringify(input),
        encoding: 'utf8',
        timeout: 60000, // 60s per batch
        maxBuffer: 50 * 1024 * 1024, // 50MB
      });

      if (r.status !== 0) {
        console.error(`\nPython error on batch ${cursor}: ${r.stderr?.slice(0, 200)}`);
      } else {
        try {
          const results = JSON.parse(r.stdout);
          for (const out of results) {
            byCategory[out.severity] = (byCategory[out.severity] || 0) + 1;
            fs.appendFileSync(OUT_FILE, JSON.stringify(out) + '\n');
          }
        } catch (e) {
          console.error(`\nParse error on batch ${cursor}: ${e.message}`);
        }
      }

      // Track detected langs (sample)
      for (const r2 of input) {
        if (r2.text.length > 200) {
          // Rough estimate
          const hasArabic = /[\u0600-\u06FF]/.test(r2.text.slice(0, 500));
          const hasGerman = /[äöüßÄÖÜ]/.test(r2.text.slice(0, 500));
          if (hasArabic) byDetected['ar'] = (byDetected['ar'] || 0) + 1;
          if (hasGerman) byDetected['de'] = (byDetected['de'] || 0) + 1;
        }
      }
    }

    scanned += batch.length;
    cursor += BATCH;
    process.stdout.write(
      `\r[${scanned}/${total}] scanned | HIGH=${byCategory.HIGH} MED=${byCategory.MEDIUM} LOW=${byCategory.LOW}    `
    );
  }

  console.log(`\n\n=== DONE ===`);
  console.log(`Total scanned: ${scanned}`);
  console.log(`By category: ${JSON.stringify(byCategory)}`);
  console.log(`Results: ${OUT_FILE}`);
  console.log(`Run: cat ${OUT_FILE} | python3 -c "import json,sys; from collections import Counter; c=Counter(); [c.update([json.loads(l)['action']]) for l in sys.stdin]; print(c)"`);

  await p.$disconnect();
})();
