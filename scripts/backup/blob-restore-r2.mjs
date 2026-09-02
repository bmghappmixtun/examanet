#!/usr/bin/env node
/**
 * Examanet Blob Restore from Cloudflare R2
 *
 * Restores Vercel Blob files from the R2 backup bucket.
 * Use this ONLY when Vercel Blob is gone or files are missing.
 *
 * The script can either:
 *   - Restore to a new Vercel Blob (re-uploads), OR
 *   - Just generate signed R2 URLs you can serve temporarily
 *
 * Usage:
 *   # List all files in R2
 *   node scripts/backup/blob-restore-r2.mjs --list
 *
 *   # Restore one file to Vercel Blob
 *   node scripts/backup/blob-restore-r2.mjs --key=teacher-library/foo/bar.pdf
 *
 *   # Restore all files to Vercel Blob
 *   node scripts/backup/blob-restore-r2.mjs --restore-all
 *
 *   # Generate a temporary public URL pointing to R2 (fastest, no re-upload)
 *   node scripts/backup/blob-restore-r2.mjs --key=... --public-url
 *
 *   # Dry-run report
 *   node scripts/backup/blob-restore-r2.mjs --report
 *
 * Required env vars (same as blob-sync-r2.mjs):
 *   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET
 *   BLOB_READ_WRITE_TOKEN (for re-upload to Vercel Blob)
 */

import {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
  PutObjectCommand,
  HeadBucketCommand,
} from '@aws-sdk/client-s3';
import { put } from '@vercel/blob';
import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

function parseArgs() {
  const args = {
    list: false,
    report: false,
    restoreAll: false,
    key: null,
    publicUrl: false,
    prefix: null,
    dryRun: false,
  };
  for (const arg of process.argv.slice(2)) {
    if (arg === '--list') args.list = true;
    else if (arg === '--report') args.report = true;
    else if (arg === '--restore-all') args.restoreAll = true;
    else if (arg === '--public-url') args.publicUrl = true;
    else if (arg === '--dry-run') args.dryRun = true;
    else if (arg.startsWith('--key=')) args.key = arg.slice(6);
    else if (arg.startsWith('--prefix=')) args.prefix = arg.slice(9);
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

async function listAllR2Keys(client, bucket, prefix = null) {
  const keys = [];
  let token = undefined;
  do {
    const res = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: token,
        MaxKeys: 1000,
      }),
    );
    for (const obj of res.Contents || []) keys.push(obj);
    token = res.NextContinuationToken;
  } while (token);
  return keys;
}

async function downloadFromR2(client, bucket, key) {
  const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const chunks = [];
  for await (const chunk of res.Body) chunks.push(chunk);
  return Buffer.concat(chunks);
}

async function uploadToVercelBlob(buffer, filename) {
  // Use Vercel Blob's put helper
  const blob = await put(filename, buffer, {
    access: 'public',
    token: process.env.BLOB_READ_WRITE_TOKEN,
  });
  return blob.url;
}

async function main() {
  const args = parseArgs();
  console.log('═══════════════════════════════════════════════════════');
  console.log('  EXAMANET — Blob Restore from R2');
  console.log('═══════════════════════════════════════════════════════');
  if (args.dryRun) console.log('  Mode: DRY-RUN');
  console.log('');

  // Show usage if no action requested (BEFORE checking creds)
  if (!args.list && !args.report && !args.key && !args.restoreAll) {
    console.log('  Usage:');
    console.log('    --list              List all R2 files');
    console.log('    --report            Show storage cost report');
    console.log('    --key=<key>         Restore single file to Vercel Blob');
    console.log('    --restore-all       Restore all files to Vercel Blob');
    console.log('    --public-url        Just generate a public R2 URL (no re-upload)');
    console.log('    --dry-run           Report only, no changes');
    console.log(
      '\n  Required env vars: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET',
    );
    return;
  }

  const { client, bucket } = getR2Client();
  console.log(`  R2 bucket: ${bucket}`);

  // Test connection
  try {
    await client.send(new HeadBucketCommand({ Bucket: bucket }));
    console.log('  ✅ Connected to R2');
  } catch (e) {
    console.error(`  ❌ Cannot connect: ${e.message}`);
    process.exit(1);
  }

  // 1. List
  if (args.list) {
    const keys = await listAllR2Keys(client, bucket, args.prefix);
    console.log(`  Found ${keys.length} files in R2`);
    const byFolder = {};
    for (const obj of keys) {
      const folder = obj.Key.split('/').slice(0, -1).join('/') || '/';
      byFolder[folder] = (byFolder[folder] || 0) + 1;
    }
    console.log('  By folder:');
    Object.entries(byFolder)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .forEach(([f, c]) => {
        console.log(`    ${f.padEnd(50)} ${c} files`);
      });
    return;
  }

  // 2. Report
  if (args.report) {
    const keys = await listAllR2Keys(client, bucket, args.prefix);
    const totalSize = keys.reduce((sum, k) => sum + (k.Size || 0), 0);
    console.log(`  Total files: ${keys.length}`);
    console.log(
      `  Total size:  ${(totalSize / 1024 / 1024).toFixed(1)} MB ($${((totalSize / 1024 / 1024 / 1024) * 0.015).toFixed(2)}/mo at R2 pricing)`,
    );
    console.log(
      `  Storage at R2 cost: $${((totalSize / 1024 / 1024 / 1024) * 0.015).toFixed(4)}/month`,
    );
    if (keys.length > 0) {
      console.log(`  Oldest:  ${new Date(keys[0].LastModified).toISOString()}`);
      console.log(`  Newest:  ${new Date(keys[keys.length - 1].LastModified).toISOString()}`);
    }
    return;
  }

  // 3. Restore single file
  if (args.key) {
    console.log(`  Restoring: ${args.key}`);
    if (args.dryRun) {
      console.log('  DRY-RUN: would download and re-upload');
      return;
    }
    const buffer = await downloadFromR2(client, bucket, args.key);
    console.log(`  Downloaded: ${(buffer.length / 1024).toFixed(1)} KB`);

    if (args.publicUrl) {
      // Generate a temporary R2 public URL (only works if bucket has public access)
      const url = `${process.env.R2_PUBLIC_URL || `https://${bucket}.${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`}/${args.key}`;
      console.log(`  R2 public URL: ${url}`);
    } else {
      // Re-upload to Vercel Blob
      if (!process.env.BLOB_READ_WRITE_TOKEN) {
        console.error('  ❌ BLOB_READ_WRITE_TOKEN required for re-upload');
        process.exit(1);
      }
      const url = await uploadToVercelBlob(buffer, path.basename(args.key));
      console.log(`  Re-uploaded to Vercel Blob: ${url}`);

      // Update DB
      const updated = await prisma.teacherFile.updateMany({
        where: { OR: [{ fileKey: args.key }, { pdfKey: args.key }] },
        data: args.key.endsWith('.pdf')
          ? { pdfUrl: url, pdfKey: args.key }
          : { fileUrl: url, fileKey: args.key },
      });
      console.log(`  DB updated: ${updated.count} TeacherFile rows`);
    }
    return;
  }

  // 4. Restore all
  if (args.restoreAll) {
    const keys = await listAllR2Keys(client, bucket, args.prefix);
    console.log(`  Found ${keys.length} files to restore`);
    if (args.dryRun) {
      console.log('  DRY-RUN: would restore all files');
      return;
    }
    let ok = 0,
      err = 0;
    for (const obj of keys) {
      try {
        const buffer = await downloadFromR2(client, bucket, obj.Key);
        const url = await uploadToVercelBlob(buffer, path.basename(obj.Key));
        await prisma.teacherFile.updateMany({
          where: { OR: [{ fileKey: obj.Key }, { pdfKey: obj.Key }] },
          data: obj.Key.endsWith('.pdf')
            ? { pdfUrl: url, pdfKey: obj.Key }
            : { fileUrl: url, fileKey: obj.Key },
        });
        ok++;
        if (ok % 50 === 0) process.stdout.write(`\r  Restored ${ok}/${keys.length}`);
      } catch (e) {
        err++;
        if (err < 5) console.error(`  [err] ${obj.Key}: ${e.message}`);
      }
    }
    console.log(`\n  Restored: ${ok}, Errors: ${err}`);
    return;
  }

  // No action specified - usage shown above
}

main()
  .catch((e) => {
    console.error('[blob-restore-r2] FAILED:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
