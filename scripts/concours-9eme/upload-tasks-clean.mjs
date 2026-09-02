import fs from 'fs';
import path from 'path';
import { config } from 'dotenv';
config({ path: '.env.local' });
config({ path: '.env' });

const SEED_TOKEN = process.env.SEED_TOKEN;
const PROD_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://examanet.com';
const ENDPOINT = `${PROD_URL}/api/admin/concours-9eme/bulk-upload`;
const MATRIX_PATH = '/workspace/docs/concours-9eme-official-matrix.json';
const ALT_DIR = '/tmp/concours-9eme-alternatifs-clean';
const BATCH_SIZE = 20;
const CONCURRENT_BATCHES = 3;
const RETRY_DELAYS = [2000, 5000, 10000];

if (!SEED_TOKEN) {
  console.error('SEED_TOKEN required');
  process.exit(1);
}

function buildTaskList() {
  const tasks = [];
  const matrix = JSON.parse(fs.readFileSync(MATRIX_PATH, 'utf8'));

  for (const [yearStr, subjects] of Object.entries(matrix)) {
    const year = parseInt(yearStr, 10);
    if (year < 2001 || year > 2026) continue;
    for (const [subject, data] of Object.entries(subjects)) {
      for (const url of data.sujets || []) {
        const track = url.includes('/technique/') ? 'technique' : 'general';
        tasks.push({
          key: `concours-9eme/officials/${year}/${track}/sujets/${subject}.pdf`,
          sourceUrl: url,
          year,
          track,
          subject,
          type: 'sujet',
          source: '9web',
        });
      }
      for (const url of data.corriges || []) {
        const track = url.includes('/technique/') ? 'technique' : 'general';
        tasks.push({
          key: `concours-9eme/officials/${year}/${track}/corriges/${subject}.pdf`,
          sourceUrl: url,
          year,
          track,
          subject,
          type: 'corrige',
          source: '9web',
        });
      }
    }
  }

  // Add 1 corrigé alternatif from ecoles.com.tn
  const altFiles = fs.existsSync(ALT_DIR)
    ? fs.readdirSync(ALT_DIR).filter((f) => f.endsWith('.pdf'))
    : [];
  for (const f of altFiles) {
    // Filename: 2021-francais_CORRIGE_ecoles.pdf
    const m = f.match(/(\d{4})-([a-z]+)_CORRIGE/);
    if (!m) continue;
    const [, year, subject] = m;
    const url = `https://www.ecoles.com.tn/sites/default/files/devoirs/files/concours_9eme_${year}_${subject}_corrige.pdf`;
    tasks.push({
      key: `concours-9eme/alternatifs/${year}/corriges/${subject}.pdf`,
      sourceUrl: url,
      year,
      subject,
      type: 'corrige',
      source: 'ecoles',
    });
  }

  return tasks;
}

async function uploadBatch(batch, attempt = 1) {
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-seed-token': SEED_TOKEN },
      body: JSON.stringify({ files: batch.map((t) => ({ key: t.key, sourceUrl: t.sourceUrl })) }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return await res.json();
  } catch (e) {
    if (attempt <= RETRY_DELAYS.length) {
      await new Promise((r) => setTimeout(r, RETRY_DELAYS[attempt - 1]));
      return uploadBatch(batch, attempt + 1);
    }
    throw e;
  }
}

function chunks(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

async function main() {
  const tasks = buildTaskList();
  console.log(`Total tasks: ${tasks.length}`);
  const batches = chunks(tasks, BATCH_SIZE);
  console.log(`Total batches: ${batches.length} (${CONCURRENT_BATCHES} parallel)\n`);

  let uploaded = 0,
    failed = 0;
  const allUploaded = [];
  const allFailed = [];
  const startTime = Date.now();

  for (let i = 0; i < batches.length; i += CONCURRENT_BATCHES) {
    const parallelBatches = batches.slice(i, i + CONCURRENT_BATCHES);
    const results = await Promise.all(
      parallelBatches.map((b) => uploadBatch(b).catch((e) => null)),
    );
    for (const r of results) {
      if (!r) continue;
      uploaded += r.uploaded.length;
      failed += r.failed.length;
      allUploaded.push(...r.uploaded);
      allFailed.push(...(r.failed_details || []));
    }
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    process.stdout.write(
      `  [${elapsed}s] ${Math.min(i + CONCURRENT_BATCHES, batches.length)}/${batches.length} batches — ${uploaded} uploaded, ${failed} failed\n`,
    );
  }

  fs.writeFileSync(
    '/workspace/docs/concours-9eme-blob-manifest.json',
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        site: 'examanet.com',
        total_tasks: tasks.length,
        total_uploaded: uploaded,
        total_failed: failed,
        uploaded: allUploaded,
        failed: allFailed,
      },
      null,
      2,
    ),
  );

  const totalSize = allUploaded.reduce((s, u) => s + (u.size || 0), 0);
  console.log(`\n=== Done ===`);
  console.log(
    `Uploaded: ${uploaded}/${tasks.length}, Failed: ${failed}, Size: ${(totalSize / 1024 / 1024).toFixed(2)}MB, Duration: ${((Date.now() - startTime) / 1000).toFixed(1)}s`,
  );
}

main().catch((e) => {
  console.error('FATAL:', e.message);
  process.exit(1);
});
