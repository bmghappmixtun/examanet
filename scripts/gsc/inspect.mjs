#!/usr/bin/env node
/**
 * Inspect URL status using Google Search Console URL Inspection API.
 * Usage: node scripts/gsc/inspect.mjs [url-or-slug]
 *
 * Examples:
 *   node scripts/gsc/inspect.mjs https://examanet.com/college
 *   node scripts/gsc/inspect.mjs college
 *   node scripts/gsc/inspect.mjs            # inspects default top pages
 */

import { searchconsole, auth } from '@googleapis/searchconsole';

const SITE_URL = process.env.SITE_URL || 'https://examanet.com';
const arg = process.argv[2];

const TARGETS = arg
  ? [arg.startsWith('http') ? arg : `${SITE_URL}/${arg.replace(/^\//, '')}`]
  : [
      `${SITE_URL}/`,
      `${SITE_URL}/college`,
      `${SITE_URL}/faq`,
      `${SITE_URL}/matieres`,
      `${SITE_URL}/professeurs`,
    ];

async function main() {
  const a = new auth.GoogleAuth({
    keyFile: '/workspace/.secrets/gsc-key.json',
    scopes: ['https://www.googleapis.com/auth/webmasters'],
  });
  const gsc = searchconsole({ version: 'v1', auth: a });

  console.log(`=== GSC URL Inspection ===\nSite: ${SITE_URL}\n`);

  for (const url of TARGETS) {
    process.stdout.write(`\n→ ${url} ... `);
    try {
      const res = await gsc.urlInspection.index.inspect({
        requestBody: { siteUrl: SITE_URL, inspectionUrl: url, languageCode: 'fr' },
      });
      const r = res.data.inspectionResult;
      if (!r) {
        console.log('no data');
        continue;
      }
      console.log('\n  Verdict       :', r.indexStatusResult?.verdict || '?');
      console.log('  Last crawl    :', r.indexStatusResult?.lastCrawlTime || 'never');
      console.log('  Coverage      :', r.indexStatusResult?.coverageState || '?');
      console.log('  Robots.txt    :', r.indexStatusResult?.robotsTxtState || '?');
      if (r.mobileUsabilityResult)
        console.log('  Mobile        :', r.mobileUsabilityResult.verdict);
      if (r.richResultsResult) console.log('  Rich results  :', r.richResultsResult.verdict);
    } catch (e) {
      if (e.code === 404) console.log('not in GSC index');
      else console.log(`ERROR: ${e.message}`);
    }
  }

  console.log('\n✓ Done');
}

main().catch((e) => {
  console.error('ERROR:', e.message);
  console.error('Code:', e.code);
  process.exit(1);
});
