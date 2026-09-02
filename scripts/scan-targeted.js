#!/usr/bin/env node
/**
 * scan-targeted.js - Quick scan of specific URLs only
 */
const fs = require('fs');
const https = require('https');

const TEACHER_NAME = process.argv[2] || 'GHARBI RIDHA';
const URL_FILTER = process.argv[3] || 'maths|devoirs|sciences|physique|arabe|francais|anglais|informatique|technologie|education';
const BASE_URL = 'https://www.tunisiecollege.net';
const CRAWL_DELAY_MS = 1500; // Faster for trusted site

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: 25000 }, (res) => {
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

function extractTeacherFiles(html, teacherName) {
  const results = [];
  const teacherNorm = teacherName.toLowerCase().replace(/\s+/g, '');
  // Jimdo structure: <a class="j-m-dowload" href="..."> ... <div class="cc-m-download-title">...</div> ... <div class="cc-m-download-description">Mr NAME</div>
  const moduleRegex = /<a[^>]*class="j-m-dowload"[^>]*href="([^"]+)"[^>]*>[\s\S]*?<div class="cc-m-download-title">([^<]+)<\/div>[\s\S]*?(?:<div class="cc-m-download-description">([^<]+)<\/div>)?/g;
  let m;
  while ((m = moduleRegex.exec(html)) !== null) {
    const [, href, title, description] = m;
    const descNorm = (description || '').toLowerCase().replace(/\s+/g, '');
    const hrefNorm = href.toLowerCase();
    const teacherInDesc = descNorm.includes(teacherNorm);
    const teacherInHref = hrefNorm.includes(teacherName.toLowerCase().replace(/\s+/g, '+'));

    if (teacherInDesc || teacherInHref) {
      const cleanHref = href.split('?')[0];
      results.push({
        url: BASE_URL + cleanHref,
        title: title.trim(),
        teacher: (description || '').trim() || teacherName,
        filename: decodeURIComponent(cleanHref.split('/').pop()),
        fileId: cleanHref.split('/')[3],
        sourcePage: ''
      });
    }
  }
  return results;
}

async function main() {
  console.log('═══════════════════════════════════════════════');
  console.log('🔍 TunisieCollege.net Scanner');
  console.log(`👨‍🏫 Teacher: ${TEACHER_NAME}`);
  console.log(`🎯 URL filter: ${URL_FILTER}`);
  console.log('═══════════════════════════════════════════════');
  console.log('');

  // Get sitemap
  console.log('📋 Fetching sitemap...');
  const xml = (await fetchUrl(`${BASE_URL}/sitemap.xml`)).toString('utf8');
  const allUrls = [];
  const regex = /<loc>([^<]+)<\/loc>/g;
  let m;
  while ((m = regex.exec(xml)) !== null) allUrls.push(m[1]);

  console.log(`   Total URLs in sitemap: ${allUrls.length}`);

  // Filter URLs
  const filterRegex = new RegExp(URL_FILTER, 'i');
  const targetUrls = allUrls.filter(u => filterRegex.test(u));
  console.log(`   Filtered to scan: ${targetUrls.length} URLs`);
  console.log('');

  const allFiles = [];
  for (let i = 0; i < targetUrls.length; i++) {
    const url = targetUrls[i];
    const displayUrl = url.replace(BASE_URL, '').slice(0, 75);
    process.stdout.write(`[${i + 1}/${targetUrls.length}] ${displayUrl.padEnd(75)} ... `);
    try {
      const html = (await fetchUrl(url)).toString('utf8');
      const files = extractTeacherFiles(html, TEACHER_NAME);
      if (files.length > 0) {
        files.forEach(f => f.sourcePage = url);
        allFiles.push(...files);
        console.log(`✓ ${files.length} file(s)`);
      } else {
        console.log('-');
      }
    } catch (e) {
      console.log(`✗ ${e.message.slice(0, 50)}`);
    }
    if (i < targetUrls.length - 1) await sleep(CRAWL_DELAY_MS);
  }

  // Dedupe by fileId
  const seen = new Set();
  const unique = allFiles.filter(f => {
    if (seen.has(f.fileId)) return false;
    seen.add(f.fileId);
    return true;
  });

  console.log('');
  console.log('═══════════════════════════════════════════════');
  console.log(`✅ Found ${unique.length} unique files by "${TEACHER_NAME}"`);
  console.log('═══════════════════════════════════════════════');
  console.log('');

  if (unique.length > 0) {
    // Print first 10
    console.log('📋 First 10 files:');
    unique.slice(0, 10).forEach((f, i) => {
      console.log(`   ${i + 1}. ${f.title}`);
      console.log(`      → ${f.filename}`);
      console.log(`      📄 ${f.url}`);
    });
    if (unique.length > 10) {
      console.log(`   ... and ${unique.length - 10} more`);
    }

    // Save manifest
    const outputDir = './downloads';
    fs.mkdirSync(outputDir, { recursive: true });
    const manifestPath = `${outputDir}/manifest-${TEACHER_NAME.replace(/\s+/g, '-').toLowerCase()}.json`;
    fs.writeFileSync(manifestPath, JSON.stringify(unique, null, 2));
    console.log('');
    console.log(`💾 Manifest saved: ${manifestPath}`);
    console.log('');
    console.log('Next steps:');
    console.log(`   1. Download: node scripts/download-manifest.js "${manifestPath}"`);
    console.log(`   2. Upload:   node scripts/upload-to-examanet.js "${manifestPath}"`);
  }
}

main().catch(e => {
  console.error('Error:', e);
  process.exit(1);
});