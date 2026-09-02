#!/usr/bin/env node
/**
 * Upload downloaded concours 9ème PDFs to Vercel Blob.
 *
 * Requirements:
 *   - BLOB_READ_WRITE_TOKEN env var (set in .env.local)
 *
 * Usage:
 *   BLOB_READ_WRITE_TOKEN=vercel_blob_xxx node scripts/concours-9eme/upload-vercel-blob.mjs
 *   # or
 *   # Add to .env.local: BLOB_READ_WRITE_TOKEN=...
 *
 * The script will:
 *   1. Read all PDFs in /tmp/concours-9eme-pdfs/
 *   2. Read all PDFs in /tmp/concours-9eme-alternatifs/
 *   3. Upload each to Vercel Blob with path: concours-9eme/{year}/{track}/{subject}.pdf
 *   4. Generate a final manifest with all public URLs (concours-9eme/manifest.json)
 *
 * Files in /tmp/concours-9eme-pdfs/ are official (9web.edunet.tn mirror)
 * Files in /tmp/concours-9eme-alternatifs/ are from ecoles.com.tn etc.
 */
import { put } from '@vercel/blob';
import fs from 'fs';
import path from 'path';
import { config } from 'dotenv';

config({ path: '.env.local' });
config({ path: '.env' });

const TOKEN = process.env.BLOB_READ_WRITE_TOKEN;
if (!TOKEN) {
  console.error('ERROR: BLOB_READ_WRITE_TOKEN not set');
  console.error('Add to .env.local: BLOB_READ_WRITE_TOKEN="vercel_blob_xxx..."');
  process.exit(1);
}

const OFFICIAL_DIR = '/tmp/concours-9eme-pdfs';
const ALT_DIR = '/tmp/concours-9eme-alternatifs';

// Subject normalization (FR/AR labels → file subject)
const SUBJECT_LABELS = {
  math: 'Mathématiques',
  francais: 'Français',
  arabe: 'Arabe',
  anglais: 'Anglais',
  svt: 'Sciences de la Vie et de la Terre',
  physique: 'Sciences Physiques',
};

function ensure(p) {
  return p.replace(/^\/|\/$/g, '');
}

async function uploadFile(filepath, blobKey) {
  const buf = fs.readFileSync(filepath);
  const blob = await put(blobKey, buf, {
    access: 'public',
    token: TOKEN,
    contentType: 'application/pdf',
    addRandomSuffix: false,
  });
  return blob.url;
}

async function main() {
  const startedAt = Date.now();
  console.log('=== Upload Concours 9ème PDFs to Vercel Blob ===\n');

  let uploaded = 0;
  let failed = 0;
  let totalBytes = 0;
  const manifest = [];

  // 1) Official files (mirror of 9web.edunet.tn)
  if (fs.existsSync(OFFICIAL_DIR)) {
    const files = fs.readdirSync(OFFICIAL_DIR).filter((f) => f.endsWith('.pdf'));
    console.log(`\n[OFFICIAL] ${files.length} files from ${OFFICIAL_DIR}`);

    for (const f of files) {
      const filepath = path.join(OFFICIAL_DIR, f);
      // f format: {year}-{track}-{subject}.pdf or {year}-{track}-{subject}_c.pdf
      const isCorrige = f.includes('_c.pdf');
      const base = f.replace('.pdf', '');
      const parts = base.split('-');
      const year = parts[0];
      const track = parts[1];
      const subject = parts.slice(2).join('-').replace('_c', '');

      const blobKey = ensure(
        `concours-9eme/officials/${year}/${track}/${isCorrige ? 'corriges' : 'sujets'}/${subject}${isCorrige ? '_c' : ''}.pdf`,
      );

      try {
        const url = await uploadFile(filepath, blobKey);
        const size = fs.statSync(filepath).size;
        totalBytes += size;
        uploaded++;
        manifest.push({
          source: 'official-9web',
          year: parseInt(year),
          track,
          subject,
          isCorrige,
          size,
          blobKey,
          url,
        });
        process.stdout.write(`  [OFFICIAL] Uploaded ${uploaded}/${files.length} (${size} bytes)\r`);
      } catch (e) {
        failed++;
        console.error(`\n  [OFFICIAL] FAIL ${f}: ${e.message}`);
      }
    }
  }

  // 2) Alternatifs (ecoles.com.tn etc.)
  if (fs.existsSync(ALT_DIR)) {
    // Walk recursively
    function walk(dir) {
      const items = [];
      for (const f of fs.readdirSync(dir)) {
        const fp = path.join(dir, f);
        if (fs.statSync(fp).isDirectory()) items.push(...walk(fp));
        else if (fp.endsWith('.pdf')) items.push(fp);
      }
      return items;
    }
    const files = walk(ALT_DIR);
    console.log(`\n[ALT] ${files.length} files from ${ALT_DIR}`);

    for (const filepath of files) {
      const relative = path.relative(ALT_DIR, filepath);
      const fname = path.basename(filepath);

      // fname format: {year}-{subject}_c.pdf or {year}-{subject}.pdf
      const isCorrige = fname.includes('_c.pdf');
      const base = fname.replace('.pdf', '').replace('_c', '');
      const parts = base.split('-');
      const year = parts[0];
      const subject = parts.slice(1).join('-');

      const blobKey = ensure(
        `concours-9eme/alternatifs/${year}/${isCorrige ? 'corriges' : 'sujets'}/${subject}${isCorrige ? '_c' : ''}.pdf`,
      );

      try {
        const url = await uploadFile(filepath, blobKey);
        const size = fs.statSync(filepath).size;
        totalBytes += size;
        uploaded++;
        manifest.push({
          source: 'alternatif-ecoles',
          year: parseInt(year),
          subject,
          isCorrige,
          size,
          blobKey,
          url,
        });
        process.stdout.write(`  [ALT] Uploaded ${uploaded}/${files.length}\r`);
      } catch (e) {
        failed++;
        console.error(`\n  [ALT] FAIL ${relative}: ${e.message}`);
      }
    }
  }

  // Write manifest
  const manifestPath = path.join('/tmp', 'concours-9eme-manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2, (sort = false)));
  console.log(`\n=== Done ===`);
  console.log(`Total uploaded: ${uploaded}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total size: ${(totalBytes / 1024 / 1024).toFixed(2)} MB`);
  console.log(`Manifest: ${manifestPath}`);
  console.log(`Duration: ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);

  // Quick stats
  const byYear = {};
  for (const m of manifest) {
    byYear[m.year] = byYear[m.year] || { sujets: 0, corriges: 0 };
    byYear[m.year][m.isCorrige ? 'corriges' : 'sujets']++;
  }
  console.log(`\n=== By year ===`);
  for (const [year, c] of Object.entries(byYear).sort()) {
    console.log(`  ${year}: ${c.sujets} sujets, ${c.corriges} corrigés`);
  }
}

main().catch((e) => {
  console.error('FATAL:', e.message);
  console.error(e.stack);
  process.exit(1);
});
