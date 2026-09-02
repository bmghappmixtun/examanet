#!/usr/bin/env node
/**
 * Download concours 9ème corrigés alternatifs from ecoles.com.tn (2020-2026)
 * Pattern: https://www.ecoles.com.tn/sites/default/files/devoirs/files/concours_9eme_{year}_{subject}[_corrige].pdf
 */
import fs from 'fs';
import https from 'https';
import path from 'path';
import http from 'http';

const OUT_DIR = '/tmp/concours-9eme-alternatifs';
const TIMEOUT_MS = 15000;

const YEARS = [2020, 2021, 2022, 2023, 2024, 2025, 2026];
const SUBJECTS = ['math', 'francais', 'arabe', 'anglais', 'svt', 'physique'];
const BASE = 'https://www.ecoles.com.tn/sites/default/files/devoirs/files/';

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const req = client.get(
      url,
      { timeout: TIMEOUT_MS, headers: { 'User-Agent': 'Mozilla/5.0' } },
      (res) => {
        if (res.statusCode === 302 || res.statusCode === 301) {
          return download(res.headers.location, dest).then(resolve).catch(reject);
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }
        ensureDir(path.dirname(dest));
        const ws = fs.createWriteStream(dest);
        res.pipe(ws);
        ws.on('finish', () => ws.close(() => resolve(fs.statSync(dest).size)));
        ws.on('error', reject);
      },
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('timeout'));
    });
  });
}

async function main() {
  console.log('=== Download Concours 9ème depuis ecoles.com.tn ===\n');
  ensureDir(OUT_DIR);

  // Patterns to try (in order of likelihood)
  // 1. With year & corrige: concours_9eme_<year>_<subj>_corrige.pdf
  // 2. Without year & corrige: concours_9eme_<subj>_corrige.pdf
  // 3. With year only: concours_9eme_<year>_<subj>.pdf
  const tasks = [];

  // First: corrigés with year (priority)
  for (const year of YEARS) {
    for (const subj of SUBJECTS) {
      // Pattern with year & corrige
      tasks.push({
        url: `${BASE}concours_9eme_${year}_${subj}_corrige.pdf`,
        dest: path.join(OUT_DIR, 'ecoles-corrige', `${year}-${subj}_c.pdf`),
      });
      // Pattern with year only (sujet)
      tasks.push({
        url: `${BASE}concours_9eme_${year}_${subj}.pdf`,
        dest: path.join(OUT_DIR, 'ecoles-sujet', `${year}-${subj}.pdf`),
      });
    }
  }

  console.log(`Total URLs to test: ${tasks.length}\n`);

  let downloaded = 0;
  let failed = 0;
  const errors = [];

  for (const t of tasks) {
    if (fs.existsSync(t.dest)) {
      downloaded++;
      continue;
    }
    try {
      const size = await download(t.url, t.dest);
      if (size < 1000) {
        // Probably an error page
        fs.unlinkSync(t.dest);
        failed++;
        continue;
      }
      downloaded++;
      process.stdout.write(
        `\r  Downloaded ${downloaded}/${tasks.length}, ${((downloaded * 100) / tasks.length).toFixed(1)}%    `,
      );
    } catch (e) {
      failed++;
      // silent for 404
    }
  }
  console.log(`\n\n=== Done ===`);
  console.log(`Total: ${downloaded + failed}, Downloaded: ${downloaded}, Failed: ${failed}`);

  // List what we have
  const files = fs.readdirSync(OUT_DIR, { recursive: true }).filter((f) => f.endsWith('.pdf'));
  console.log(`\nFiles on disk: ${files.length}`);
  // Group by year
  const byYear = {};
  for (const f of files) {
    const year = f.split('-')[0];
    if (!byYear[year]) byYear[year] = [];
    byYear[year].push(f);
  }
  for (const [year, fs] of Object.entries(byYear).sort()) {
    console.log(`  ${year}: ${fs.length} files`);
    for (const f of fs.slice(0, 5)) console.log(`    - ${f}`);
    if (fs.length > 5) console.log(`    ... +${fs.length - 5} more`);
  }

  const totalSize = files.reduce((s, f) => s + fs.statSync(path.join(OUT_DIR, f)).size, 0);
  console.log(`\nTotal size: ${(totalSize / 1024 / 1024).toFixed(2)} MB`);
}

main().catch((e) => {
  console.error('FATAL:', e.message);
  process.exit(1);
});
