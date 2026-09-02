#!/usr/bin/env node
/**
 * IndexNow URL notification
 * Usage: node scripts/indexnow/notify.mjs <url1> [url2] [...]
 *
 * IndexNow is supported by Bing, Yandex, Naver, Seznam, and others.
 * Quota: 10,000 URLs/day per host.
 *
 * Requires:
 *   - /public/<KEY>.txt verification file (committed to repo)
 *   - /workspace/.secrets/indexnow-key (gitignored)
 */
import fs from 'node:fs';

const SITE_URL = process.env.SITE_URL || 'https://examanet.com';
const HOST = new URL(SITE_URL).host;
const KEY_FILE = '/workspace/.secrets/indexnow-key';
const ENDPOINT = 'https://api.indexnow.org/indexnow';

function loadKey() {
  if (!fs.existsSync(KEY_FILE)) {
    console.error(`Missing key file: ${KEY_FILE}`);
    process.exit(1);
  }
  return fs.readFileSync(KEY_FILE, 'utf8').trim();
}

async function main() {
  const urls = process.argv.slice(2);

  if (urls.length === 0) {
    // Default: notify key pages
    urls.push(
      `${SITE_URL}/`,
      `${SITE_URL}/concours-9eme-tunisie`,
      `${SITE_URL}/concours-9eme-tunisie/sujets-passes`,
      `${SITE_URL}/college`,
      `${SITE_URL}/ressources`,
    );
  }

  // Validate URLs
  for (const u of urls) {
    try {
      const host = new URL(u).host;
      if (host !== HOST) {
        console.error(`❌ URL host mismatch: ${u} (expected ${HOST})`);
        process.exit(1);
      }
    } catch {
      console.error(`❌ Invalid URL: ${u}`);
      process.exit(1);
    }
  }

  const key = loadKey();
  const keyLocation = `https://${HOST}/${key}.txt`;
  const body = {
    host: HOST,
    key: key,
    keyLocation: keyLocation,
    urlList: urls,
  };

  console.log(`=== IndexNow Notification ===`);
  console.log(`Host: ${HOST}`);
  console.log(`Key: ${key}`);
  console.log(`Key location: ${keyLocation}`);
  console.log(`URLs to notify: ${urls.length}`);
  console.log(`Endpoint: ${ENDPOINT}\n`);

  console.log('Verifying key file is accessible...');
  try {
    const verifyRes = await fetch(keyLocation);
    const verifyText = (await verifyRes.text()).trim();
    if (verifyRes.ok && verifyText === key) {
      console.log(`✅ Key file verified at ${keyLocation}\n`);
    } else {
      console.error(`❌ Key file mismatch or not found (HTTP ${verifyRes.status})`);
      console.error(`   Expected: ${key}`);
      console.error(`   Got: ${verifyText}`);
      process.exit(1);
    }
  } catch (e) {
    console.error(`❌ Could not verify key file: ${e.message}`);
    process.exit(1);
  }

  console.log('Submitting URLs to IndexNow...');
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(body),
  });

  // IndexNow returns 200 OK if successful
  // 202 = URL received, key validation pending
  // 400 = bad format
  // 403 = key not valid
  // 422 = URLs don't belong to host
  // 429 = too many requests
  const status = res.status;
  console.log(`HTTP ${status}: ${res.statusText}`);

  if (status === 200 || status === 202) {
    console.log(`✅ ${urls.length} URL(s) notified successfully`);
    console.log(`\nNotified URLs:`);
    for (const u of urls) console.log(`  - ${u}`);
    console.log(`\nParticipating engines notified: Bing, Yandex, Naver, Seznam, ...`);
    console.log(`Crawl queue: typically processed within minutes.`);
  } else if (status === 403) {
    console.error(`❌ Key not valid. Make sure ${keyLocation} is accessible and contains the key.`);
    process.exit(1);
  } else if (status === 422) {
    console.error(`❌ URLs don't belong to host ${HOST}`);
    process.exit(1);
  } else if (status === 429) {
    console.error(`❌ Too many requests. Daily quota: 10,000 URLs.`);
    process.exit(1);
  } else {
    console.error(`❌ Unexpected error`);
    const text = await res.text();
    if (text) console.error(text);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error('Unexpected error:', e);
  process.exit(1);
});
