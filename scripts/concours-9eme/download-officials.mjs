#!/usr/bin/env node
/**
 * Download all official Concours 9ème PDFs from 9web.edunet.tn
 * Output structure (flat, easy to upload to Vercel Blob):
 *   /tmp/concours-9eme-pdfs/{year}-{track}-{subject}.pdf
 *   /tmp/concours-9eme-pdfs/{year}-{track}-{subject}_c.pdf
 *
 * Tracks: 'general' (default for 2001-2008), 'technique' (from 2009)
 * Subjects: math, svt, francais, anglais, arabe, physique
 */
import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';

const OUT_DIR = '/tmp/concours-9eme-pdfs';
const TIMEOUT_MS = 30000; // 30s per download
const PARALLEL = 5; // download 5 files in parallel

// Stats
let downloaded = 0;
let failed = 0;
let totalBytes = 0;
const failures = [];

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function sanitize(s) {
  return s.replace(/[^a-zA-Z0-9-_]/g, '_');
}

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const req = client.get(url, { timeout: TIMEOUT_MS }, (res) => {
      if (res.statusCode === 302 || res.statusCode === 301) {
        // Follow redirect
        return download(res.headers.location, dest).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        return;
      }
      ensureDir(path.dirname(dest));
      const ws = fs.createWriteStream(dest);
      res.pipe(ws);
      ws.on('finish', () => {
        ws.close();
        const size = fs.statSync(dest).size;
        resolve(size);
      });
      ws.on('error', reject);
    });
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Timeout ${url}`));
    });
  });
}

async function runPool(urls, parallelism) {
  const results = [];
  for (let i = 0; i < urls.length; i += parallelism) {
    const batch = urls.slice(i, i + parallelism);
    const res = await Promise.all(
      batch.map(async ({ url, dest }) => {
        try {
          const size = await download(url, dest);
          downloaded++;
          totalBytes += size;
          return { ok: true, url, size };
        } catch (e) {
          failed++;
          failures.push({ url, error: e.message });
          return { ok: false, url, error: e.message };
        }
      }),
    );
    results.push(...res);
    process.stdout.write(
      `  Progress: ${downloaded + failed}/${urls.length} (${downloaded} ok, ${failed} fail)\r`,
    );
  }
  console.log(); // newline
  return results;
}

async function main() {
  console.log('=== Download Concours 9ème officiels (9web.edunet.tn) ===\n');

  // Load matrix
  const matrixPath = '/workspace/docs/concours-9eme-official-matrix.json';
  const matrix = JSON.parse(fs.readFileSync(matrixPath, 'utf8'));

  // Build download list with target paths (flat)
  const tasks = [];
  for (const [yearStr, subjects] of Object.entries(matrix)) {
    const year = parseInt(yearStr, 10);
    if (year < 2001 || year > 2026) continue;

    for (const [subject, data] of Object.entries(subjects)) {
      // Sujets
      for (const url of data.sujets || []) {
        const track = url.includes('/technique/') ? 'technique' : 'general';
        const filename = `${year}-${track}-${subject}.pdf`;
        const dest = path.join(OUT_DIR, filename);
        if (!fs.existsSync(dest)) {
          tasks.push({ url, dest });
        }
      }
      // Corrigés
      for (const url of data.corriges || []) {
        const track = url.includes('/technique/') ? 'technique' : 'general';
        const filename = `${year}-${track}-${subject}_c.pdf`;
        const dest = path.join(OUT_DIR, filename);
        if (!fs.existsSync(dest)) {
          tasks.push({ url, dest });
        }
      }
    }
  }

  console.log(`Total to download: ${tasks.length} PDFs`);
  console.log(`Output dir: ${OUT_DIR}`);
  console.log(`Parallelism: ${PARALLEL}\n`);

  ensureDir(OUT_DIR);

  const startTime = Date.now();
  await runPool(tasks, PARALLEL);
  const duration = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log(`\n=== DONE ===`);
  console.log(`Downloaded: ${downloaded} / ${tasks.length}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total size: ${(totalBytes / 1024 / 1024).toFixed(2)} MB`);
  console.log(`Duration: ${duration}s`);

  if (failures.length > 0) {
    console.log(`\n=== Failures (${failures.length}) ===`);
    for (const f of failures.slice(0, 10)) {
      console.log(`  ${f.url}: ${f.error}`);
    }
  }

  // List output
  const files = fs.readdirSync(OUT_DIR).filter((f) => f.endsWith('.pdf'));
  console.log(`\nFiles on disk: ${files.length}`);
  console.log(
    `Total size: ${(files.reduce((s, f) => s + fs.statSync(path.join(OUT_DIR, f)).size, 0) / 1024 / 1024).toFixed(2)} MB`,
  );
}

main().catch((e) => {
  console.error('FATAL:', e.message);
  process.exit(1);
});
