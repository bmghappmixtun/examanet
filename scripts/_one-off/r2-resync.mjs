#!/usr/bin/env node
/**
 * R2 Resync — downloads missing PDFs from Vercel Blob CDN and uploads to R2
 * Bypasses Vercel Blob API (uses public URLs)
 * Idempotent: skips files already in R2
 */
import { S3Client, HeadObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { createWriteStream, existsSync } from 'fs';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import { setTimeout as sleep } from 'timers/promises';

// Vercel public CDN URL prefix
const VERCEL_CDN = 'https://kmy1h6us8l7bg7bg.public.blob.vercel-storage.com/';

// Load Vercel paths (from inventory)
import { readFileSync } from 'fs';
const urls = readFileSync('/workspace/edutunisie/backups/verify-2026-08-24/2026-08-24/urls.txt', 'utf-8')
  .split('\n').filter(Boolean);

// Extract unique pathnames
const pathSet = new Set();
for (const u of urls) {
  try {
    const p = new URL(u);
    pathSet.add(p.pathname.replace(/^\//, ''));
  } catch (e) {}
}
const allPaths = [...pathSet];
console.log(`[resync] Total unique Vercel paths: ${allPaths.length}`);

// R2 client
const R2_BUCKET = 'examanet-pdf-prod';
const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

async function existsInR2(key) {
  try {
    await r2.send(new HeadObjectCommand({ Bucket: R2_BUCKET, Key: key }));
    return true;
  } catch (e) {
    if (e.name === 'NotFound' || e.$metadata?.httpStatusCode === 404) return false;
    throw e;
  }
}

async function downloadAndUpload(key) {
  const url = VERCEL_CDN + key;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Examanet-R2Resync/1.0' },
  });
  if (!res.ok) {
    return { ok: false, reason: `HTTP ${res.status}` };
  }
  const arrayBuffer = await res.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // Upload to R2
  await r2.send(new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: key,
    Body: buffer,
    ContentType: 'application/pdf',
    Metadata: { 'x-source': 'vercel-blob-resync-2026-08-24' },
  }));
  return { ok: true, size: buffer.length };
}

async function main() {
  console.log(`[resync] Connecting to R2 bucket: ${R2_BUCKET}`);
  console.log(`[resync] Loading existing R2 keys to skip...`);

  // Load existing R2 keys
  const { ListObjectsV2Command } = await import('@aws-sdk/client-s3');
  const existing = new Set();
  let token;
  do {
    const r = await r2.send(new ListObjectsV2Command({
      Bucket: R2_BUCKET,
      Prefix: 'teacher-library/',
      ContinuationToken: token,
      MaxKeys: 1000,
    }));
    for (const c of r.Contents || []) existing.add(c.Key);
    token = r.NextContinuationToken;
  } while (token);
  console.log(`[resync] Existing R2 keys: ${existing.size}`);

  // Filter to only missing
  const missing = allPaths.filter(p => !existing.has(p));
  console.log(`[resync] Files missing from R2: ${missing.length}`);

  if (missing.length === 0) {
    console.log('[resync] ✅ All files already in R2. Nothing to do.');
    return;
  }

  let uploaded = 0;
  let errors = 0;
  let bytesUploaded = 0;
  const start = Date.now();
  const errorLog = [];

  for (let i = 0; i < missing.length; i++) {
    const key = missing[i];
    try {
      const result = await downloadAndUpload(key);
      if (result.ok) {
        uploaded++;
        bytesUploaded += result.size;
        if (i % 10 === 0) {
          const elapsed = ((Date.now() - start) / 1000).toFixed(1);
          const rate = (uploaded / elapsed).toFixed(2);
          console.log(`[resync] ${i + 1}/${missing.length} ${uploaded} ok, ${errors} err, ${(bytesUploaded / 1024 / 1024).toFixed(1)} MB, ${elapsed}s, ${rate} files/s`);
        }
      } else {
        errors++;
        errorLog.push({ key, reason: result.reason });
      }
    } catch (e) {
      errors++;
      errorLog.push({ key, reason: e.message?.slice(0, 100) });
    }
    // Be nice to Vercel CDN: small delay every 50 files
    if (i % 50 === 0) await sleep(100);
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log('');
  console.log(`[resync] ✅ DONE in ${elapsed}s`);
  console.log(`  - Uploaded: ${uploaded}`);
  console.log(`  - Errors:   ${errors}`);
  console.log(`  - Total:    ${(bytesUploaded / 1024 / 1024).toFixed(2)} MB`);
  if (errorLog.length > 0) {
    const fs = await import('fs');
    fs.writeFileSync('/workspace/edutunisie/backups/r2-inventory-2026-08-24/resync-errors.json', JSON.stringify(errorLog, null, 2));
    console.log(`  - Errors logged to: backups/r2-inventory-2026-08-24/resync-errors.json`);
  }
}

main().catch(e => {
  console.error('[resync] FATAL:', e);
  process.exit(1);
});
