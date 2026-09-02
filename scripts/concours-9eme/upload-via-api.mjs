#!/usr/bin/env node
/**
 * Bulk upload Concours 9ème PDFs via the Vercel API route.
 *
 * This script:
 *  1. Reads the URLs from the official matrix + alternatifs list
 *  2. Sends batches of 20 URLs at a time to /api/admin/concours-9eme/bulk-upload
 *  3. Server downloads each URL, uploads to Vercel Blob using OIDC (auto)
 *  4. Builds a JSON manifest of all URLs
 *
 * Why this approach:
 *   - No token to manage (Vercel OIDC auto)
 *   - Server is in the same datacenter as Blob (fast)
 *   - Parallel batches = fast (~3 min for 250 files)
 *   - Doesn't expose credentials in our sandbox
 *
 * Prereqs:
 *   - The route /api/admin/concours-9eme/bulk-upload must be deployed on Vercel
 *   - SEED_TOKEN env var must be set in client (matches Vercel config)
 *
 * Usage:
 *   SEED_TOKEN=xxx node scripts/concours-9eme/upload-via-api.mjs
 */

import fs from 'fs';
import path from 'path';
import { config } from 'dotenv';

config({ path: '.env.local' });
config({ path: '.env' });

const SEED_TOKEN = process.env.SEED_TOKEN;
const PROD_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://examanet.com';
const ENDPOINT = `${PROD_URL}/api/admin/concours-9eme/bulk-upload`;

if (!SEED_TOKEN) {
  console.error('ERROR: SEED_TOKEN env var is required');
  console.error('Add to .env.local or pass: SEED_TOKEN=xxx node ...');
  process.exit(1);
}

const MATRIX_PATH = '/workspace/docs/concours-9eme-official-matrix.json';
const MANIFEST_PATH = '/workspace/docs/concours-9eme-blob-manifest.json';
const BATCH_SIZE = 20;
const CONCURRENT_BATCHES = 3; // Run 3 batches in parallel
const RETRY_DELAYS = [2000, 5000, 10000]; // Exponential backoff

// Build task list (the URLs we want uploaded)
function buildTaskList() {
  const matrix = JSON.parse(fs.readFileSync(MATRIX_PATH, 'utf8'));
  const tasks = [];

  for (const [yearStr, subjects] of Object.entries(matrix)) {
    const year = parseInt(yearStr, 10);
    if (year < 2001 || year > 2026) continue;

    for (const [subject, data] of Object.entries(subjects)) {
      // Sujets
      for (const url of data.sujets || []) {
        const track = url.includes('/technique/') ? 'technique' : 'general';
        const safeSubj = subject; // already short key
        const key = `concours-9eme/officials/${year}/${track}/sujets/${safeSubj}.pdf`;
        tasks.push({ key, sourceUrl: url, year, track, subject, type: 'sujet', source: '9web' });
      }
      // Corrigés
      for (const url of data.corriges || []) {
        const track = url.includes('/technique/') ? 'technique' : 'general';
        const safeSubj = subject;
        const key = `concours-9eme/officials/${year}/${track}/corriges/${safeSubj}.pdf`;
        tasks.push({ key, sourceUrl: url, year, track, subject, type: 'corrige', source: '9web' });
      }
    }
  }
  return tasks;
}

async function uploadBatch(batch, attempt = 1) {
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-seed-token': SEED_TOKEN,
      },
      body: JSON.stringify({ files: batch.map((t) => ({ key: t.key, sourceUrl: t.sourceUrl })) }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
    }

    const result = await res.json();
    return result;
  } catch (e) {
    if (attempt <= RETRY_DELAYS.length) {
      const delay = RETRY_DELAYS[attempt - 1];
      console.log(
        `  ⚠️  Batch failed (${e.message}), retrying in ${delay}ms (attempt ${attempt + 1})`,
      );
      await new Promise((r) => setTimeout(r, delay));
      return uploadBatch(batch, attempt + 1);
    }
    throw e;
  }
}

function chunks(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function main() {
  console.log(`=== Concours 9ème Bulk Upload via API ===\n`);
  console.log(`Endpoint: ${ENDPOINT}`);
  console.log(`Batch size: ${BATCH_SIZE} files/batch, ${CONCURRENT_BATCHES} batches parallel\n`);

  const tasks = buildTaskList();
  console.log(`Total tasks: ${tasks.length}`);

  const batches = chunks(tasks, BATCH_SIZE);
  console.log(`Total batches: ${batches.length}\n`);

  let totalUploaded = 0;
  let totalFailed = 0;
  let totalBytes = 0;
  let totalErrors = 0;
  const allFailed = [];
  const allUploaded = [];
  const startTime = Date.now();

  // Process batches with limited concurrency
  for (let i = 0; i < batches.length; i += CONCURRENT_BATCHES) {
    const parallelBatches = batches.slice(i, i + CONCURRENT_BATCHES);
    const results = await Promise.all(
      parallelBatches.map(async (batch) => {
        try {
          return await uploadBatch(batch);
        } catch (e) {
          totalErrors++;
          for (const t of batch) {
            allFailed.push({ key: t.key, sourceUrl: t.sourceUrl, error: e.message });
          }
          return null;
        }
      }),
    );
    for (const r of results) {
      if (!r) continue;
      totalUploaded += r.uploaded.length;
      totalFailed += r.failed.length;
      for (const u of r.uploaded) allUploaded.push(u);
      for (const f of r.failed_details || []) allFailed.push(f);
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const completed = Math.min(i + CONCURRENT_BATCHES, batches.length);
    process.stdout.write(
      `  [${elapsed}s] Batch ${completed}/${batches.length} — ${totalUploaded} uploaded, ${totalFailed} failed\n`,
    );
  }

  // Persist manifest
  fs.writeFileSync(
    MANIFEST_PATH,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        site: 'examanet.com',
        total_tasks: tasks.length,
        total_uploaded: totalUploaded,
        total_failed: totalFailed,
        total_errors: totalErrors,
        uploaded: allUploaded,
        failed: allFailed,
      },
      null,
      2,
    ),
  );

  const totalSize = allUploaded.reduce((s, u) => s + (u.size || 0), 0);
  const duration = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log(`\n=== Summary ===`);
  console.log(`Uploaded: ${totalUploaded}/${tasks.length}`);
  console.log(`Failed:   ${totalFailed}`);
  console.log(`Errors:   ${totalErrors}`);
  console.log(`Total:    ${(totalSize / 1024 / 1024).toFixed(2)} MB`);
  console.log(`Duration: ${duration}s`);
  console.log(`Manifest: ${MANIFEST_PATH}`);
}

main().catch((e) => {
  console.error('FATAL:', e.message);
  process.exit(1);
});
