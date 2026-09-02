#!/usr/bin/env node
/**
 * download-manifest.js - Download all PDFs from a manifest
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: 60000 }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchUrl(res.headers.location).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        return;
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    });
    req.on('error', reject);
  });
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  const manifestPath = process.argv[2] || './downloads/manifest-gharbi-ridha.json';
  const outputDir = process.argv[3] || './downloads/pdfs';

  if (!fs.existsSync(manifestPath)) {
    console.error(`Manifest not found: ${manifestPath}`);
    process.exit(1);
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  console.log(`📦 ${manifest.length} files to download`);
  console.log(`📂 Output: ${outputDir}`);
  console.log('');

  fs.mkdirSync(outputDir, { recursive: true });

  let success = 0, failed = 0;
  const updatedManifest = [];

  for (let i = 0; i < manifest.length; i++) {
    const file = manifest[i];
    const safeName = decodeURIComponent(file.filename).replace(/[^a-zA-Z0-9._-]/g, '_');
    const outPath = path.join(outputDir, safeName);

    process.stdout.write(`[${i + 1}/${manifest.length}] ${file.filename.slice(0, 50).padEnd(50)} ... `);
    try {
      const buf = await fetchUrl(file.url);
      fs.writeFileSync(outPath, buf);
      file.localPath = outPath;
      file.localSize = buf.length;
      success++;
      console.log(`✓ ${(buf.length / 1024).toFixed(0)} KB`);
    } catch (e) {
      console.log(`✗ ${e.message.slice(0, 60)}`);
      file.error = e.message;
      failed++;
    }
    updatedManifest.push(file);
    if (i < manifest.length - 1) await sleep(1500);
  }

  // Update manifest with download status
  fs.writeFileSync(manifestPath, JSON.stringify(updatedManifest, null, 2));

  console.log('');
  console.log('═══════════════════════════════════════════════');
  console.log(`✅ Downloaded: ${success}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`📦 Total: ${manifest.length}`);
  console.log('═══════════════════════════════════════════════');
}

main().catch(e => { console.error(e); process.exit(1); });