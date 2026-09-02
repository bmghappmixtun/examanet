#!/usr/bin/env node
/**
 * Examanet Code Mirror to R2
 *
 * Syncs the git-tracked code to Cloudflare R2 as a "safe place" backup.
 * This way, even if GitHub is gone, we have a snapshot of every release.
 *
 * What gets uploaded:
 *   - A git bundle (single file containing full repo history)
 *   - The current ARCHITECTURE.md
 *   - A snapshot of package.json + lockfile
 *
 * Frequency: Daily via GitHub Action (after DB backup, before R2 blob sync)
 *
 * Required env vars (same as blob-sync-r2.mjs):
 *   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET
 *   R2_CODE_PREFIX (optional, default: "code/")
 */

import {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';

function getR2Client() {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET;
  const endpoint = process.env.R2_ENDPOINT || `https://${accountId}.r2.cloudflarestorage.com`;
  const prefix = process.env.R2_CODE_PREFIX || 'code/';
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
    prefix,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const forceFull = args.includes('--full');

  console.log('═══════════════════════════════════════════════════════');
  console.log('  EXAMANET — Code Mirror to R2');
  console.log('═══════════════════════════════════════════════════════');
  if (dryRun) console.log('  Mode: DRY-RUN');

  const { client, bucket, prefix } = getR2Client();
  console.log(`  R2 bucket: ${bucket}`);
  console.log(`  R2 prefix: ${prefix}`);

  // 1. Get current commit + branch
  const currentCommit = execSync('git rev-parse HEAD').toString().trim();
  const currentCommitShort = currentCommit.slice(0, 7);
  const currentBranch = execSync('git branch --show-current').toString().trim();
  const lastCommitDate = execSync('git log -1 --format=%cI').toString().trim();
  console.log(`  Branch:  ${currentBranch}`);
  console.log(`  Commit:  ${currentCommitShort}`);

  // 2. Create tarball of working tree (respects .gitignore)
  //    This is a "snapshot" — not a full git history (that's what GitHub is for).
  //    We use `tar` to exclude gitignored files (node_modules, backups, etc.)
  const archiveName = `source-${currentBranch}-${currentCommitShort}.tar.gz`;
  const archivePath = `/tmp/${archiveName}`;
  console.log(`  Creating source tarball: ${archiveName}`);
  try {
    // Use git to list tracked files (faster, more accurate than find + .gitignore parsing)
    const trackedFiles = execSync('git ls-files').toString().trim().split('\n');
    fs.writeFileSync('/tmp/git-files.txt', trackedFiles.join('\n'));
    // tar reads filenames from stdin with -T
    execSync(`tar czf ${archivePath} -T /tmp/git-files.txt`, { stdio: 'pipe' });
    const archiveSize = fs.statSync(archivePath).size;
    console.log(
      `    Tarball size: ${(archiveSize / 1024).toFixed(1)} KB (${trackedFiles.length} files)`,
    );
  } catch (e) {
    console.error(`  ❌ tar failed: ${e.message}`);
    process.exit(1);
  }

  // 3. Check if R2 already has this commit
  const archiveKey = `${prefix}${archiveName}`;
  let needsUpload = forceFull;
  if (!needsUpload) {
    try {
      await client.send(new HeadObjectCommand({ Bucket: bucket, Key: archiveKey }));
      console.log(`  ⏭️  Archive already in R2 (commit ${currentCommitShort})`);
      needsUpload = false;
    } catch (e) {
      if (e.name === 'NotFound' || e.$metadata?.httpStatusCode === 404) {
        needsUpload = true;
      } else {
        console.error(`  ❌ R2 check failed: ${e.message}`);
        process.exit(1);
      }
    }
  }

  // 4. Upload archive
  if (needsUpload) {
    if (dryRun) {
      console.log(`  DRY-RUN: would upload ${archiveKey}`);
    } else {
      const archiveBuffer = fs.readFileSync(archivePath);
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: archiveKey,
          Body: archiveBuffer,
          ContentType: 'application/gzip',
          Metadata: {
            branch: currentBranch,
            commit: currentCommit,
            date: lastCommitDate,
            'synced-at': new Date().toISOString(),
          },
        }),
      );
      console.log(`  ✅ Uploaded: ${archiveKey} (${(archiveBuffer.length / 1024).toFixed(1)} KB)`);
    }
  }

  // 5. Always upload a "latest" pointer
  const latestKey = `${prefix}latest-${currentBranch}.txt`;
  const latestContent = `${currentCommit}\n${currentBranch}\n${lastCommitDate}\n`;
  if (!dryRun) {
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: latestKey,
        Body: latestContent,
        ContentType: 'text/plain',
      }),
    );
    console.log(`  ✅ Uploaded: ${latestKey} (latest pointer)`);
  } else {
    console.log(`  DRY-RUN: would upload ${latestKey}`);
  }

  // 6. Upload ARCHITECTURE.md if exists
  if (fs.existsSync('ARCHITECTURE.md')) {
    const archKey = `${prefix}ARCHITECTURE.md`;
    if (!dryRun) {
      const archBuffer = fs.readFileSync('ARCHITECTURE.md');
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: archKey,
          Body: archBuffer,
          ContentType: 'text/markdown',
        }),
      );
      console.log(`  ✅ Uploaded: ${archKey} (${(archBuffer.length / 1024).toFixed(1)} KB)`);
    } else {
      console.log(`  DRY-RUN: would upload ${archKey}`);
    }
  }

  // 7. List existing R2 code backups
  if (!dryRun) {
    const list = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        MaxKeys: 100,
      }),
    );
    const archives = (list.Contents || []).filter((o) => o.Key.endsWith('.tar.gz'));
    const totalSize = (list.Contents || []).reduce((s, o) => s + (o.Size || 0), 0);
    console.log(`\n  R2 code backup summary:`);
    console.log(`    Total objects: ${(list.Contents || []).length}`);
    console.log(`    Source snapshots: ${archives.length}`);
    console.log(`    Total size:    ${(totalSize / 1024).toFixed(1)} KB`);
    if (archives.length > 0) {
      console.log(
        `    Oldest: ${new Date(archives[archives.length - 1].LastModified).toISOString().slice(0, 10)}`,
      );
      console.log(`    Newest: ${new Date(archives[0].LastModified).toISOString().slice(0, 10)}`);
    }
  }

  // 8. Cleanup tmp
  fs.unlinkSync(archivePath);
  try {
    fs.unlinkSync('/tmp/git-files.txt');
  } catch {}

  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  ✅ Code mirror complete');
  console.log('═══════════════════════════════════════════════════════');
}

main().catch((e) => {
  console.error('[code-mirror-r2] FAILED:', e);
  process.exit(1);
});
