#!/usr/bin/env node
/**
 * Submit sitemap to Bing Webmaster Tools
 * Usage: node scripts/bing/submit-sitemap.mjs [sitemap-path]
 *
 * Reads API key from /workspace/.secrets/bing-webmaster-api-key
 * Endpoint: POST https://ssl.bing.com/webmaster/api.svc/json/SubmitFeed
 */
import fs from 'node:fs';
import path from 'node:path';

const SITE_URL = process.env.SITE_URL || 'https://examanet.com';
const KEY_FILE = '/workspace/.secrets/bing-webmaster-api-key';
const BASE = 'https://ssl.bing.com/webmaster/api.svc/json';
const sitemapPath = process.argv[2] || 'sitemap.xml';

function loadKey() {
  if (!fs.existsSync(KEY_FILE)) {
    console.error(`Missing API key file: ${KEY_FILE}`);
    console.error('Create it with: echo "<your-bing-api-key>" > ' + KEY_FILE);
    process.exit(1);
  }
  return fs.readFileSync(KEY_FILE, 'utf8').trim();
}

async function callBing(endpoint, method = 'GET', body = null) {
  const url = `${BASE}/${endpoint}?apikey=${loadKey()}`;
  const opts = { method };
  if (body) {
    opts.headers = { 'Content-Type': 'application/json', charset: 'utf-8' };
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(url, opts);
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* not JSON */
  }
  return { status: res.status, ok: res.ok, json, text };
}

async function main() {
  const feedUrl = `${SITE_URL.replace(/\/$/, '')}/${sitemapPath.replace(/^\//, '')}`;

  console.log(`=== Bing Webmaster: Submit Sitemap ===\nSite: ${SITE_URL}\nSitemap: ${feedUrl}\n`);

  // SubmitFeed (the only working endpoint for sitemap submission)
  console.log('Submitting via SubmitFeed...');
  const r = await callBing('SubmitFeed', 'POST', {
    siteUrl: SITE_URL,
    feedUrl: feedUrl,
  });

  if (r.ok && r.json && 'd' in r.json) {
    console.log(`✅ Sitemap submitted successfully (HTTP ${r.status})`);
    console.log(`   Response: ${JSON.stringify(r.json)}`);
    console.log('\nNext: Bing will crawl your sitemap within 24-48 hours.');
    console.log('Check status at: https://www.bing.com/webmasters → Sitemaps');
  } else {
    console.error(`❌ Submission failed (HTTP ${r.status})`);
    console.error(`   Body: ${r.text.slice(0, 500)}`);
    if (r.status === 401 || r.status === 403) {
      console.error('\nHint: API key may be invalid or site not verified.');
    }
    process.exit(1);
  }
}

main().catch((e) => {
  console.error('Unexpected error:', e);
  process.exit(1);
});
