#!/usr/bin/env node
/**
 * Examanet Vercel Blob Inventory
 *
 * Lists ALL files stored in Vercel Blob with:
 *   - pathname (the key in the bucket)
 *   - url (public URL)
 *   - size (bytes)
 *   - uploadedAt
 *   - contentType
 *
 * Output: JSON inventory + summary by folder
 *
 * Usage: node scripts/backup/blob-inventory.mjs [--out=./backups/blob]
 *
 * NOTE: This only lists files, doesn't download. Use blob-sync.mjs to
 * actually mirror them to R2/S3/local.
 */

import { list } from '@vercel/blob';
import fs from 'fs';
import path from 'path';

async function main() {
  const arg = process.argv.find((a) => a.startsWith('--out='));
  const outDir = arg ? arg.slice(6) : './backups/blob';
  const date = new Date().toISOString().slice(0, 10);
  const fullDir = path.join(outDir, date);
  fs.mkdirSync(fullDir, { recursive: true });

  console.log(`[blob-inventory] Listing Vercel Blob...`);
  const start = Date.now();
  const allBlobs = [];
  let cursor = undefined;
  let pageCount = 0;

  do {
    const result = await list({ cursor, limit: 1000 });
    allBlobs.push(...result.blobs);
    cursor = result.cursor;
    pageCount++;
    process.stdout.write(`\r  Page ${pageCount}: ${allBlobs.length} blobs so far...`);
  } while (cursor);

  console.log(`\n[blob-inventory] Found ${allBlobs.length} blobs in ${pageCount} pages`);

  // Summary by folder
  const byFolder = {};
  let totalSize = 0;
  for (const blob of allBlobs) {
    const folder = blob.pathname.split('/').slice(0, -1).join('/') || '/';
    if (!byFolder[folder]) byFolder[folder] = { count: 0, size: 0 };
    byFolder[folder].count++;
    byFolder[folder].size += blob.size || 0;
    totalSize += blob.size || 0;
  }

  // Save raw list
  const inventoryPath = path.join(fullDir, 'inventory.json');
  fs.writeFileSync(
    inventoryPath,
    JSON.stringify(
      allBlobs.map((b) => ({
        pathname: b.pathname,
        url: b.url,
        size: b.size,
        uploadedAt: b.uploadedAt,
        contentType: b.contentType,
      })),
      null,
      2,
    ),
  );

  // Save summary
  const summary = {
    timestamp: new Date().toISOString(),
    totalBlobs: allBlobs.length,
    totalSize,
    totalSizeMB: (totalSize / 1024 / 1024).toFixed(2),
    byFolder: Object.fromEntries(
      Object.entries(byFolder)
        .sort((a, b) => b[1].size - a[1].size)
        .map(([k, v]) => [k, { count: v.count, sizeMB: (v.size / 1024 / 1024).toFixed(2) }]),
    ),
  };
  fs.writeFileSync(path.join(fullDir, 'summary.json'), JSON.stringify(summary, null, 2));

  // Also write a URLs-only file for quick download scripts
  const urls = allBlobs.map((b) => b.url).join('\n');
  fs.writeFileSync(path.join(fullDir, 'urls.txt'), urls);

  const duration = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`\n[blob-inventory] DONE in ${duration}s`);
  console.log(`[blob-inventory] Total: ${allBlobs.length} files, ${summary.totalSizeMB} MB`);
  console.log(`[blob-inventory] Top folders:`);
  Object.entries(summary.byFolder)
    .slice(0, 10)
    .forEach(([folder, info]) => {
      console.log(
        `  ${folder.padEnd(50)} ${String(info.count).padStart(6)} files  ${info.sizeMB} MB`,
      );
    });
  console.log(`\n[blob-inventory] Output: ${fullDir}`);
  console.log(`  - inventory.json: full list with metadata`);
  console.log(`  - summary.json: aggregate by folder`);
  console.log(`  - urls.txt: just URLs (for download scripts)`);
}

main().catch((e) => {
  console.error('[blob-inventory] FAILED:', e);
  process.exit(1);
});
