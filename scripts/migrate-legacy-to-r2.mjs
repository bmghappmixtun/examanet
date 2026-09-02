#!/usr/bin/env node
/**
 * Bulk migration: External sources (Vercel Blob, bacweb.tn) → R2
 *
 * Reads the Concours 9ème and BAC manifests, then for each entry:
 *   1. Checks R2 via /api/admin/migrate-file?key=... (HEAD)
 *   2. If not in R2, calls POST /api/admin/migrate-file with {key, url} to fetch + upload
 *
 * Usage:
 *   node scripts/migrate-legacy-to-r2.mjs [--concurrency=10] [--only=concours|bac] [--limit=100]
 *
 * Required env:
 *   WORKER_URL         e.g. https://examanet-prod.examanet-poc.workers.dev
 *   MIGRATE_TOKEN      Bearer token (must match Worker env MIGRATE_TOKEN)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const WORKER_URL = process.env.WORKER_URL || 'https://examanet-prod.examanet-poc.workers.dev';
const MIGRATE_TOKEN = process.env.MIGRATE_TOKEN;
if (!MIGRATE_TOKEN) {
  console.error('ERROR: MIGRATE_TOKEN env var is required');
  process.exit(1);
}

const args = process.argv.slice(2);
const concurrency = parseInt(args.find((a) => a.startsWith('--concurrency='))?.split('=')[1] || '10', 10);
const onlyFilter = args.find((a) => a.startsWith('--only='))?.split('=')[1];
const limit = parseInt(args.find((a) => a.startsWith('--limit='))?.split('=')[1] || '0', 10);

// Extract entries (key, url) from manifests
function extractEntries(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const entries = [];
  // Match "key": "X", ... "url": "Y" patterns
  const re = /"key":\s*"([^"]+)"[\s\S]*?"url":\s*"([^"]+)"/g;
  let m;
  while ((m = re.exec(content)) !== null) {
    entries.push({ key: m[1], url: m[2] });
  }
  return entries;
}

const concoursEntries = extractEntries(path.join(ROOT, 'src/data/concours-9eme-manifest.ts'));
const bacEntries = extractEntries(path.join(ROOT, 'src/data/bac-manifest.ts'));

console.log(`Found ${concoursEntries.length} Concours entries, ${bacEntries.length} BAC entries`);

let allEntries = [];
if (!onlyFilter || onlyFilter === 'concours') {
  allEntries = allEntries.concat(concoursEntries.map((e) => ({ ...e, type: 'concours' })));
}
if (!onlyFilter || onlyFilter === 'bac') {
  allEntries = allEntries.concat(bacEntries.map((e) => ({ ...e, type: 'bac' })));
}

if (limit > 0) {
  allEntries = allEntries.slice(0, limit);
}

console.log(`Total to process: ${allEntries.length} (concurrency: ${concurrency})`);
console.log(`Worker: ${WORKER_URL}`);
console.log('');

// Stats
let inR2 = 0;
let migrated = 0;
let notFound = 0;
let errors = 0;
let processed = 0;
const startTime = Date.now();

async function processEntry(entry) {
  const { key, url } = entry;
  try {
    // 1. Check R2 (HEAD via GET endpoint)
    const checkRes = await fetch(`${WORKER_URL}/api/admin/migrate-file?key=${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${MIGRATE_TOKEN}` },
    });

    if (checkRes.status === 200) {
      inR2++;
      return { key, status: 'in-r2' };
    }

    if (checkRes.status !== 404) {
      const text = await checkRes.text();
      errors++;
      return { key, status: 'error', detail: `check returned ${checkRes.status}: ${text.slice(0, 200)}` };
    }

    // 2. Not in R2, try to migrate
    const migrateRes = await fetch(`${WORKER_URL}/api/admin/migrate-file`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${MIGRATE_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ key, url }),
    });

    const body = await migrateRes.json().catch(() => ({}));

    if (migrateRes.status === 200 && body.status === 'migrated') {
      migrated++;
      return { key, status: 'migrated', size: body.size };
    }
    if (migrateRes.status === 200 && body.status === 'already-in-r2') {
      inR2++;
      return { key, status: 'in-r2' };
    }
    if (migrateRes.status === 404 && body.status === 'not-found') {
      notFound++;
      return { key, status: 'missing', upstreamStatus: body.upstreamStatus };
    }
    errors++;
    return { key, status: 'error', detail: `migrate returned ${migrateRes.status}: ${JSON.stringify(body).slice(0, 200)}` };
  } catch (e) {
    errors++;
    return { key, status: 'exception', detail: e.message };
  } finally {
    processed++;
    if (processed % 50 === 0 || processed === allEntries.length) {
      const elapsed = (Date.now() - startTime) / 1000;
      const rate = processed / elapsed;
      const eta = (allEntries.length - processed) / rate;
      console.log(
        `[${processed}/${allEntries.length}] ` +
        `inR2=${inR2} migrated=${migrated} missing=${notFound} errors=${errors} ` +
        `${rate.toFixed(1)}/s ETA=${eta.toFixed(0)}s`
      );
    }
  }
}

async function run() {
  const queue = [...allEntries];
  const workers = [];

  for (let i = 0; i < concurrency; i++) {
    workers.push((async () => {
      while (queue.length > 0) {
        const item = queue.shift();
        if (!item) break;
        await processEntry(item);
      }
    })());
  }

  await Promise.all(workers);

  const elapsed = (Date.now() - startTime) / 1000;
  console.log('');
  console.log('=== Final ===');
  console.log(`Total: ${allEntries.length}`);
  console.log(`  Already in R2: ${inR2}`);
  console.log(`  Migrated: ${migrated}`);
  console.log(`  Missing upstream: ${notFound}`);
  console.log(`  Errors: ${errors}`);
  console.log(`Time: ${elapsed.toFixed(1)}s`);
}

run().catch((e) => {
  console.error('Fatal:', e);
  process.exit(1);
});
