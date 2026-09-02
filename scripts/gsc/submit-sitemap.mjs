#!/usr/bin/env node
/**
 * Submit sitemap to Google Search Console
 * Usage: node scripts/gsc/submit-sitemap.mjs [sitemap-path]
 */
import { webmasters, auth } from '@googleapis/webmasters';

const SITE_URL = process.env.SITE_URL || 'https://examanet.com';
const sitemapPath = process.argv[2] || 'sitemap.xml';

async function main() {
  const a = new auth.GoogleAuth({
    keyFile: '/workspace/.secrets/gsc-key.json',
    scopes: ['https://www.googleapis.com/auth/webmasters'],
  });
  const gsc = webmasters({ version: 'v3', auth: a });

  console.log(`=== GSC: Submit Sitemap ===\nSite: ${SITE_URL}\nSitemap: ${sitemapPath}\n`);

  console.log('Current sitemaps:');
  const existing = await gsc.sitemaps.list({ siteUrl: SITE_URL });
  for (const sm of existing.data.sitemap || []) {
    console.log(`  - ${sm.path} (last submitted: ${sm.lastSubmitted || 'never'})`);
  }

  console.log(`\nSubmitting ${sitemapPath}...`);
  const feedpath = `${SITE_URL.replace(/\/$/, '')}/${sitemapPath.replace(/^\//, '')}`;
  await gsc.sitemaps.submit({ siteUrl: SITE_URL, feedpath });
  console.log('OK');

  console.log('\nUpdated list:');
  const updated = await gsc.sitemaps.list({ siteUrl: SITE_URL });
  for (const sm of updated.data.sitemap || []) {
    console.log(`  - ${sm.path} (last submitted: ${sm.lastSubmitted || 'never'})`);
  }

  console.log('\n✓ Done');
}

main().catch((e) => {
  console.error('ERROR:', e.message);
  console.error('Code:', e.code);
  console.error('Status:', e.response?.status);
  if (e.response?.data) console.error('Body:', JSON.stringify(e.response.data, null, 2));
  process.exit(1);
});
