#!/usr/bin/env node
/**
 * Submit individual URLs to Bing Webmaster Tools (instant indexing)
 * Usage: node scripts/bing/submit-url.mjs <url1> [url2] [url3] ...
 *
 * Reads API key from /workspace/.secrets/bing-webmaster-api-key
 * Endpoint: POST https://ssl.bing.com/webmaster/api.svc/json/SubmitUrlBatch
 *
 * Note: Bing has daily quotas (typically 10,000 URLs/day per site).
 */
import fs from 'node:fs';

const SITE_URL = process.env.SITE_URL || 'https://examanet.com';
const KEY_FILE = '/workspace/.secrets/bing-webmaster-api-key';
const BASE = 'https://ssl.bing.com/webmaster/api.svc/json';

function loadKey() {
  if (!fs.existsSync(KEY_FILE)) {
    console.error(`Missing API key file: ${KEY_FILE}`);
    process.exit(1);
  }
  return fs.readFileSync(KEY_FILE, 'utf8').trim();
}

async function callBing(endpoint, body) {
  const url = `${BASE}/${endpoint}?apikey=${loadKey()}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', charset: 'utf-8' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {}
  return { status: res.status, ok: res.ok, json, text };
}

async function main() {
  const urls = process.argv.slice(2);

  if (urls.length === 0) {
    // Default: submit key pages
    urls.push(
      `${SITE_URL}/`,
      `${SITE_URL}/concours-9eme-tunisie`,
      `${SITE_URL}/concours-9eme-tunisie/sujets-passes`,
      `${SITE_URL}/college`,
      `${SITE_URL}/ressources`,
    );
  }

  // Validate URLs match siteUrl
  for (const u of urls) {
    if (!u.startsWith(SITE_URL)) {
      console.error(`❌ URL outside site scope: ${u}`);
      console.error(`   All URLs must start with ${SITE_URL}`);
      process.exit(1);
    }
  }

  console.log(
    `=== Bing Webmaster: Submit URLs ===\nSite: ${SITE_URL}\nURLs to submit: ${urls.length}\n`,
  );

  // SubmitUrlBatch (more efficient than SubmitUrl for multiple URLs)
  const r = await callBing('SubmitUrlBatch', {
    siteUrl: SITE_URL,
    urlList: urls,
  });

  if (r.ok) {
    console.log(`✅ ${urls.length} URLs submitted successfully (HTTP ${r.status})`);
    console.log(`   Response: ${JSON.stringify(r.json)}`);
    console.log('\nSubmitted URLs:');
    for (const u of urls) console.log(`  - ${u}`);
  } else {
    console.error(`❌ Submission failed (HTTP ${r.status})`);
    console.error(`   Body: ${r.text.slice(0, 500)}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error('Unexpected error:', e);
  process.exit(1);
});
