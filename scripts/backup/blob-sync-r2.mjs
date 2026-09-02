#!/usr/bin/env node
/**
 * Examanet Blob → Cloudflare R2 Sync
 *
 * Mirrors all Vercel Blob files to a Cloudflare R2 bucket for off-site backup.
 * Idempotent: re-running only uploads new/changed files (delta detection by ETag).
 *
 * Usage:
 *   # First run: full backup
 *   node scripts/backup/blob-sync-r2.mjs
 *
 *   # Dry-run (no uploads, just report)
 *   node scripts/backup/blob-sync-r2.mjs --dry-run
 *
 *   # Only sync files in a specific folder
 *   node scripts/backup/blob-sync-r2.mjs --prefix=teacher-library/
 *
 *   # Use existing inventory file
 *   node scripts/backup/blob-sync-r2.mjs --from-inventory=backups/blob/2026-07-09/inventory.json
 *
 * Required env vars (create R2 API token at https://dash.cloudflare.com/?to=/:account/r2/api-tokens):
 *   R2_ACCOUNT_ID        Cloudflare account ID
 *   R2_ACCESS_KEY_ID     R2 access key
 *   R2_SECRET_ACCESS_KEY R2 secret key
 *   R2_BUCKET            Bucket name (e.g. "examanet-blob-backup")
 *   R2_ENDPOINT          (optional) Custom endpoint, defaults to https://{ACCOUNT_ID}.r2.cloudflarestorage.com
 *
 * Cost estimate (measured 2026-07-09):
 *   Storage: 13.64 GB total (10 GB free + 3.64 GB × $0.015/GB) = ~$0.06/month
 *   Egress:  $0 (R2 has free egress)
 *   Class A ops: 15K PUTs × $4.50/M = $0.07/month
 *   Class B ops: HEAD/GET × $0.36/M = $0.01/month
 *   TOTAL:  ~$0.13/month
 */

import {
  S3Client,
  HeadObjectCommand,
  PutObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';

const prisma = new PrismaClient();

function parseArgs() {
  const args = { dryRun: false, prefix: null, fromInventory: null, concurrency: 8 };
  for (const arg of process.argv.slice(2)) {
    if (arg === '--dry-run') args.dryRun = true;
    else if (arg.startsWith('--prefix=')) args.prefix = arg.slice(9);
    else if (arg.startsWith('--from-inventory=')) args.fromInventory = arg.slice(17);
    else if (arg.startsWith('--concurrency=')) args.concurrency = parseInt(arg.slice(14), 10);
  }
  return args;
}

function getR2Client() {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET;
  const endpoint = process.env.R2_ENDPOINT || `https://${accountId}.r2.cloudflarestorage.com`;

  const missing = [];
  if (!accountId) missing.push('R2_ACCOUNT_ID');
  if (!accessKeyId) missing.push('R2_ACCESS_KEY_ID');
  if (!secretAccessKey) missing.push('R2_SECRET_ACCESS_KEY');
  if (!bucket) missing.push('R2_BUCKET');
  if (missing.length) {
    console.error('  ❌ Missing R2 env vars:', missing.join(', '));
    console.error('     See header of this script for setup instructions.');
    process.exit(1);
  }

  return {
    client: new S3Client({
      region: 'auto',
      endpoint,
      credentials: { accessKeyId, secretAccessKey },
    }),
    bucket,
  };
}

/**
 * Extract the storage path from a Vercel Blob URL.
 * Example: https://kmy1h6us8l7bg7bg.public.blob.vercel-storage.com/teacher-library/foo/bar.pdf
 *   → teacher-library/foo/bar.pdf
 */
function urlToKey(url) {
  try {
    const u = new URL(url);
    // pathname starts with /, strip it
    return u.pathname.replace(/^\//, '');
  } catch {
    return null;
  }
}

/**
 * List all keys already in R2 (paginated). Returns a Map<key, etag>.
 */
async function listR2Keys(client, bucket, prefix = null) {
  const keys = new Map();
  let continuationToken = undefined;
  let pageCount = 0;
  do {
    const cmd = new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: prefix,
      ContinuationToken: continuationToken,
      MaxKeys: 1000,
    });
    const res = await client.send(cmd);
    for (const obj of res.Contents || []) {
      keys.set(obj.Key, obj.ETag);
    }
    continuationToken = res.NextContinuationToken;
    pageCount++;
  } while (continuationToken);
  return keys;
}

/**
 * Get the list of blob URLs to backup, either from DB or inventory file.
 */
async function collectUrls(args) {
  if (args.fromInventory) {
    console.log(`  Loading URLs from inventory: ${args.fromInventory}`);
    const data = JSON.parse(fs.readFileSync(args.fromInventory, 'utf8'));
    return data.map((d) => ({ url: d.url, filename: d.filename, size: d.size }));
  }
  console.log('  Querying DB for TeacherFile URLs...');
  const teacherFiles = await prisma.teacherFile.findMany({
    select: {
      id: true,
      fileName: true,
      fileUrl: true,
      fileKey: true,
      fileSize: true,
      pdfUrl: true,
      pdfKey: true,
      pdfSize: true,
    },
  });
  const urls = [];
  for (const f of teacherFiles) {
    if (f.fileUrl)
      urls.push({ url: f.fileUrl, filename: f.fileName, size: f.fileSize, key: f.fileKey });
    if (f.pdfUrl)
      urls.push({
        url: f.pdfUrl,
        filename: f.fileName?.replace(/\.[^.]+$/, '') + '.pdf',
        size: f.pdfSize,
        key: f.pdfKey,
      });
  }
  return urls;
}

async function syncFile(client, bucket, url, key, dryRun) {
  if (dryRun) {
    return { skipped: true };
  }
  // Download from Vercel Blob
  const res = await fetch(url);
  if (!res.ok) {
    return { error: `HTTP ${res.status}` };
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  const hash = createHash('md5').update(buffer).digest('hex');

  // Upload to R2
  const contentType = res.headers.get('content-type') || 'application/octet-stream';
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      Metadata: {
        'source-url': url,
        'source-md5': hash,
        'synced-at': new Date().toISOString(),
      },
    }),
  );
  return { uploaded: true, size: buffer.length, etag: hash };
}

async function main() {
  const args = parseArgs();
  console.log('═══════════════════════════════════════════════════════');
  console.log('  EXAMANET — Blob → R2 Sync');
  console.log('═══════════════════════════════════════════════════════');
  if (args.dryRun) console.log('  Mode: DRY-RUN (no uploads)');
  if (args.prefix) console.log(`  Prefix: ${args.prefix}`);
  if (args.fromInventory) console.log(`  Inventory: ${args.fromInventory}`);

  const { client, bucket } = getR2Client();
  console.log(`  R2 bucket: ${bucket}`);
  console.log('');

  // 1. Get all URLs to backup
  const allItems = await collectUrls(args);
  console.log(`  Found ${allItems.length} URLs in DB`);
  if (args.prefix) {
    const before = allItems.length;
    const filtered = allItems.filter((i) => urlToKey(i.url)?.startsWith(args.prefix));
    console.log(
      `  Filtered to ${filtered.length} (prefix=${args.prefix}, dropped ${before - filtered.length})`,
    );
    allItems.length = 0;
    allItems.push(...filtered);
  }

  // 2. List R2 keys (delta detection)
  console.log('  Listing existing R2 keys...');
  const r2Keys = await listR2Keys(client, bucket, args.prefix);
  console.log(`  R2 already has ${r2Keys.size} keys`);

  // 3. Compute delta
  const toUpload = [];
  const skipped = [];
  for (const item of allItems) {
    const key = urlToKey(item.url);
    if (!key) {
      skipped.push({ ...item, reason: 'invalid URL' });
      continue;
    }
    if (r2Keys.has(key)) {
      skipped.push({ ...item, key, reason: 'already in R2' });
    } else {
      toUpload.push({ ...item, key });
    }
  }

  console.log(`  To upload: ${toUpload.length}`);
  console.log(`  Skipped:   ${skipped.length}`);
  console.log('');

  if (args.dryRun) {
    console.log('  DRY-RUN — first 5 files that would be uploaded:');
    toUpload.slice(0, 5).forEach((i) => console.log(`    ${i.key} (${(i.size || 0) / 1024} KB)`));
    console.log('═══════════════════════════════════════════════════════');
    return;
  }

  // 4. Upload with concurrency
  let uploaded = 0,
    errors = 0,
    bytes = 0;
  const start = Date.now();
  const queue = [...toUpload];
  const concurrency = args.concurrency;

  async function worker(workerId) {
    while (queue.length > 0) {
      const item = queue.shift();
      if (!item) break;
      try {
        const result = await syncFile(client, bucket, item.url, item.key, false);
        if (result.error) {
          errors++;
          if (errors < 20) console.log(`  [err] ${item.key}: ${result.error}`);
        } else {
          uploaded++;
          bytes += result.size || 0;
        }
      } catch (e) {
        errors++;
        if (errors < 20) console.log(`  [err] ${item.key}: ${e.message}`);
      }
      if ((uploaded + errors) % 50 === 0) {
        const pct = Math.round(((uploaded + errors) / toUpload.length) * 100);
        const elapsed = ((Date.now() - start) / 1000).toFixed(0);
        process.stdout.write(
          `\r  ${uploaded + errors}/${toUpload.length} (${pct}%) — ${(bytes / 1024 / 1024).toFixed(1)} MB uploaded, ${errors} errors [${elapsed}s, w${workerId}]`,
        );
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, (_, i) => worker(i + 1)));

  // 5. Summary
  const duration = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`\n\n  DONE in ${duration}s`);
  console.log(`  Uploaded: ${uploaded} (${(bytes / 1024 / 1024).toFixed(1)} MB)`);
  console.log(`  Skipped:  ${skipped.length} (already in R2)`);
  console.log(`  Errors:   ${errors}`);

  // 6. Save sync manifest
  const manifestPath = `backups/blob/sync-${new Date().toISOString().slice(0, 10)}.json`;
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  fs.writeFileSync(
    manifestPath,
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        duration: parseFloat(duration),
        total: allItems.length,
        uploaded,
        skipped: skipped.length,
        errors,
        bytes,
        bucket,
      },
      null,
      2,
    ),
  );
  console.log(`  Manifest: ${manifestPath}`);

  console.log('═══════════════════════════════════════════════════════');
}

main()
  .catch((e) => {
    console.error('[blob-sync-r2] FAILED:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
