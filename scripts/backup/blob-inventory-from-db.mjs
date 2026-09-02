#!/usr/bin/env node
/**
 * Examanet Vercel Blob Inventory (DB-based)
 *
 * Enumerates ALL blob URLs stored in the database (TeacherFile.url + Resource fields)
 * instead of listing via the Vercel Blob API.
 *
 * This is the practical approach: we have URLs in DB, no need to call the Blob API.
 *
 * Output: URLs list + per-host breakdown + size estimate (HEAD requests)
 *
 * Usage: node scripts/backup/blob-inventory-from-db.mjs [--out=./backups/blob] [--probe-size]
 */

import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

async function main() {
  const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}`));
  const outArg = arg('out');
  const outDir = outArg ? outArg.slice(6) : './backups/blob';
  const probeSize = !!arg('probe-size');
  const date = new Date().toISOString().slice(0, 10);
  const fullDir = path.join(outDir, date);
  fs.mkdirSync(fullDir, { recursive: true });

  console.log(`[blob-inventory] Collecting URLs from DB...`);
  const start = Date.now();

  // 1. URLs from TeacherFile (fileUrl, pdfUrl)
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
      originalFormat: true,
      createdAt: true,
    },
  });
  console.log(`  TeacherFile: ${teacherFiles.length} rows`);

  // 2. URLs from other URL fields
  const allUrls = [];
  for (const f of teacherFiles) {
    if (f.fileUrl) {
      allUrls.push({
        source: 'teacher_file',
        id: f.id,
        url: f.fileUrl,
        key: f.fileKey,
        filename: f.fileName,
        size: f.fileSize,
        format: f.originalFormat,
        createdAt: f.createdAt,
      });
    }
    if (f.pdfUrl) {
      allUrls.push({
        source: 'teacher_file_pdf',
        id: f.id,
        url: f.pdfUrl,
        key: f.pdfKey,
        filename: f.fileName?.replace(/\.[^.]+$/, '') + '.pdf',
        size: f.pdfSize,
        format: 'pdf',
        createdAt: f.createdAt,
      });
    }
  }

  // 3. Break down by host (Vercel Blob vs other)
  const byHost = {};
  for (const item of allUrls) {
    try {
      const host = new URL(item.url).host;
      if (!byHost[host]) byHost[host] = [];
      byHost[host].push(item);
    } catch {}
  }

  console.log(`\n  By host:`);
  for (const [host, items] of Object.entries(byHost).sort((a, b) => b[1].length - a[1].length)) {
    console.log(`    ${host.padEnd(60)} ${String(items.length).padStart(6)} files`);
  }

  // 4. Optional: probe each URL for HEAD size (slow!)
  if (probeSize) {
    console.log(`\n[blob-inventory] Probing sizes via HEAD requests (this will take a while)...`);
    let probed = 0;
    for (const item of allUrls) {
      try {
        const res = await fetch(item.url, { method: 'HEAD' });
        if (res.ok) {
          item.probedSize = Number(res.headers.get('content-length') || 0);
          item.probedType = res.headers.get('content-type');
        }
      } catch {}
      probed++;
      if (probed % 100 === 0) process.stdout.write(`\r  Probed: ${probed}/${allUrls.length}`);
    }
    console.log();
  }

  // 5. Save
  fs.writeFileSync(path.join(fullDir, 'inventory.json'), JSON.stringify(allUrls, null, 2));
  const summary = {
    timestamp: new Date().toISOString(),
    totalUrls: allUrls.length,
    byHost: Object.fromEntries(Object.entries(byHost).map(([h, items]) => [h, items.length])),
    sizeInfo: probeSize
      ? {
          totalProbed: allUrls.filter((i) => i.probedSize).length,
          totalBytes: allUrls.reduce((sum, i) => sum + (i.probedSize || 0), 0),
          totalMB: (allUrls.reduce((sum, i) => sum + (i.probedSize || 0), 0) / 1024 / 1024).toFixed(
            2,
          ),
        }
      : null,
  };
  fs.writeFileSync(path.join(fullDir, 'summary.json'), JSON.stringify(summary, null, 2));
  fs.writeFileSync(path.join(fullDir, 'urls.txt'), allUrls.map((i) => i.url).join('\n'));

  const duration = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`\n[blob-inventory] DONE in ${duration}s`);
  console.log(
    `[blob-inventory] Total: ${allUrls.length} URLs across ${Object.keys(byHost).length} hosts`,
  );
  console.log(`[blob-inventory] Output: ${fullDir}`);
}

main()
  .catch((e) => {
    console.error('[blob-inventory] FAILED:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
