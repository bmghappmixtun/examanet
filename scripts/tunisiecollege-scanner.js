#!/usr/bin/env node
/**
 * tunisiecollege-scanner.js
 * Scan tunisiecollege.net and find all PDFs by a specific teacher.
 * Usage: node tunisiecollege-scanner.js [teacher-name] [output-dir]
 * Example: node tunisiecollege-scanner.js "GHARBI RIDHA" ./downloads
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const TEACHER_NAME = process.argv[2] || 'GHARBI RIDHA';
const OUTPUT_DIR = process.argv[3] || './downloads';
const BASE_URL = 'https://www.tunisiecollege.net';
const CRAWL_DELAY_MS = 5000; // Respect robots.txt Crawl-Delay: 5

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: 30000 }, (res) => {
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

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function extractTeacherFiles(html, teacherName) {
  const results = [];
  // Each download module in Jimdo has this structure:
  // <a href="/app/download/.../...Mr+GHARBI+RIDHA.pdf">
  //   <div class="cc-m-download-title">...</div>
  //   <div class="cc-m-download-description">Mr GHARBI RIDHA</div>
  // </a>
  const moduleRegex = /<a[^>]*class="j-m-dowload"[^>]*href="([^"]+)"[^>]*>[\s\S]*?<div class="cc-m-download-title">([^<]+)<\/div>[\s\S]*?<div class="cc-m-download-description">([^<]+)<\/div>/g;

  let match;
  while ((match = moduleRegex.exec(html)) !== null) {
    const [_, href, title, description] = match;
    if (description.toLowerCase().includes(teacherName.toLowerCase()) ||
        href.toLowerCase().includes(teacherName.toLowerCase().replace(/\s+/g, '+'))) {
      // Clean URL (remove ?t=... cache buster)
      const cleanHref = href.split('?')[0];
      results.push({
        url: BASE_URL + cleanHref,
        title: title.trim(),
        teacher: description.trim(),
        filename: cleanHref.split('/').pop()
      });
    }
  }
  return results;
}

async function getSitemap() {
  console.log('Fetching sitemap...');
  const xml = await fetchUrl(`${BASE_URL}/sitemap.xml`);
  const urls = [];
  const regex = /<loc>([^<]+)<\/loc>/g;
  let m;
  while ((m = regex.exec(xml.toString())) !== null) {
    urls.push(m[1]);
  }
  console.log(`Sitemap: ${urls.length} URLs found`);
  return urls;
}

async function scan() {
  // Create output dirs
  const pdfDir = path.join(OUTPUT_DIR, 'pdfs');
  fs.mkdirSync(pdfDir, { recursive: true });

  // Get URLs from sitemap
  const urls = await getSitemap();

  // Filter for content pages (skip admin/static)
  const contentUrls = urls.filter(u =>
    !u.includes('/ajouter-un-devoir') &&
    !u.endsWith('/') &&
    !u.includes('/contact') &&
    !u.includes('/blog')
  );
  console.log(`Will scan ${contentUrls.length} content pages...`);

  const allFiles = [];

  for (let i = 0; i < contentUrls.length; i++) {
    const url = contentUrls[i];
    process.stdout.write(`[${i + 1}/${contentUrls.length}] ${url.slice(BASE_URL.length).slice(0, 80)}... `);
    try {
      const html = (await fetchUrl(url)).toString('utf8');
      const files = extractTeacherFiles(html, TEACHER_NAME);
      if (files.length > 0) {
        console.log(`✓ ${files.length} file(s)`);
        files.forEach(f => { f.sourcePage = url; });
        allFiles.push(...files);
      } else {
        console.log('-');
      }
    } catch (e) {
      console.log(`✗ ${e.message}`);
    }
    // Respect robots.txt
    if (i < contentUrls.length - 1) await sleep(CRAWL_DELAY_MS);
  }

  // Generate manifest
  const manifest = allFiles.map(f => ({
    title: f.title,
    teacher: f.teacher,
    sourcePage: f.sourcePage,
    pdfUrl: f.url,
    filename: f.filename,
    downloadedPath: ''
  }));

  const manifestPath = path.join(OUTPUT_DIR, `manifest-${TEACHER_NAME.replace(/\s+/g, '-').toLowerCase()}.json`);
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  const csvPath = path.join(OUTPUT_DIR, `manifest-${TEACHER_NAME.replace(/\s+/g, '-').toLowerCase()}.csv`);
  const csv = [
    'title,teacher,filename,source_page,pdf_url',
    ...manifest.map(m =>
      `"${m.title.replace(/"/g, '""')}","${m.teacher}","${m.filename}","${m.sourcePage}","${m.pdfUrl}"`
    )
  ].join('\n');
  fs.writeFileSync(csvPath, '\uFEFF' + csv); // BOM for Excel

  console.log('');
  console.log('═══════════════════════════════════════════════');
  console.log(`✓ Found ${manifest.length} files by "${TEACHER_NAME}"`);
  console.log(`✓ Manifest: ${manifestPath}`);
  console.log(`✓ CSV:      ${csvPath}`);
  console.log('═══════════════════════════════════════════════');

  return manifest;
}

async function downloadFiles(manifest) {
  console.log('');
  console.log(`Downloading ${manifest.length} PDFs...`);
  const pdfDir = path.join(OUTPUT_DIR, 'pdfs');

  for (let i = 0; i < manifest.length; i++) {
    const file = manifest[i];
    process.stdout.write(`[${i + 1}/${manifest.length}] ${file.filename.slice(0, 60)}... `);
    try {
      const buf = await fetchUrl(file.pdfUrl);
      const outPath = path.join(pdfDir, file.filename);
      fs.writeFileSync(outPath, buf);
      file.downloadedPath = outPath;
      console.log(`✓ ${(buf.length / 1024).toFixed(0)} KB`);
    } catch (e) {
      console.log(`✗ ${e.message}`);
    }
    if (i < manifest.length - 1) await sleep(2000);
  }

  // Update manifest
  fs.writeFileSync(
    path.join(OUTPUT_DIR, `manifest-${TEACHER_NAME.replace(/\s+/g, '-').toLowerCase()}.json`),
    JSON.stringify(manifest, null, 2)
  );

  return manifest;
}

// Main
(async () => {
  console.log('');
  console.log('🔍 tunisiecollege.net Scanner');
  console.log(`👨‍🏫 Teacher: ${TEACHER_NAME}`);
  console.log(`📂 Output: ${OUTPUT_DIR}`);
  console.log('');

  const action = process.argv[4] || 'scan'; // 'scan' | 'download' | 'all'

  if (action === 'scan' || action === 'all') {
    const manifest = await scan();
    if (action === 'all' && manifest.length > 0) {
      await downloadFiles(manifest);
      console.log('');
      console.log('🎉 Done! To upload to Examanet:');
      console.log(`   node scripts/upload-to-examanet.js "${OUTPUT_DIR}/manifest-${TEACHER_NAME.replace(/\s+/g, '-').toLowerCase()}.json"`);
    }
  } else if (action === 'download') {
    const manifestPath = path.join(OUTPUT_DIR, `manifest-${TEACHER_NAME.replace(/\s+/g, '-').toLowerCase()}.json`);
    if (!fs.existsSync(manifestPath)) {
      console.error(`Run scan first: node tunisiecollege-scanner.js "${TEACHER_NAME}" "${OUTPUT_DIR}"`);
      process.exit(1);
    }
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    await downloadFiles(manifest);
  }
})().catch(e => {
  console.error('Error:', e);
  process.exit(1);
});