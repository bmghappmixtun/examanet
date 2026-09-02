#!/usr/bin/env node
/**
 * Fetch search analytics: top queries, top pages, by country.
 * Usage: node scripts/gsc/analytics.mjs [days=28]
 */
import { webmasters, auth } from '@googleapis/webmasters';

const SITE_URL = process.env.SITE_URL || 'https://examanet.com';
const days = parseInt(process.argv[2] || '28', 10);

async function main() {
  const a = new auth.GoogleAuth({
    keyFile: '/workspace/.secrets/gsc-key.json',
    scopes: ['https://www.googleapis.com/auth/webmasters.readonly'],
  });
  const gsc = webmasters({ version: 'v3', auth: a });

  console.log(`=== GSC Analytics — Last ${days} days ===\nSite: ${SITE_URL}\n`);

  const endDate = new Date(Date.now() - 3 * 86400000).toISOString().slice(0, 10);
  const startDate = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  console.log(`Period: ${startDate} → ${endDate}\n`);

  // Top queries
  console.log('🔥 TOP QUERIES (by clicks):');
  const queries = await gsc.searchanalytics.query({
    siteUrl: SITE_URL,
    requestBody: { startDate, endDate, dimensions: ['query'], rowLimit: 20 },
  });
  const qrows = (queries.data.rows || []).slice().sort((a, b) => b.clicks - a.clicks);
  for (const q of qrows) {
    console.log(
      `  ${String(q.clicks).padStart(5)} clicks | ${String(q.impressions).padStart(5)} imps | ${(q.ctr * 100).toFixed(1).padStart(5)}% | pos ${q.position.toFixed(1).padStart(4)} | "${q.keys[0]}"`,
    );
  }

  // Top pages
  console.log('\n📄 TOP PAGES (by clicks):');
  const pages = await gsc.searchanalytics.query({
    siteUrl: SITE_URL,
    requestBody: { startDate, endDate, dimensions: ['page'], rowLimit: 20 },
  });
  const prows = (pages.data.rows || []).slice().sort((a, b) => b.clicks - a.clicks);
  for (const p of prows) {
    const url = p.keys[0].replace(SITE_URL, '');
    console.log(
      `  ${String(p.clicks).padStart(5)} clicks | ${String(p.impressions).padStart(5)} imps | ${(p.ctr * 100).toFixed(1).padStart(5)}% | pos ${p.position.toFixed(1).padStart(4)} | ${url}`,
    );
  }

  // By country
  console.log('\n🌍 BY COUNTRY:');
  const countries = await gsc.searchanalytics.query({
    siteUrl: SITE_URL,
    requestBody: { startDate, endDate, dimensions: ['country'], rowLimit: 20 },
  });
  const crows = (countries.data.rows || []).slice().sort((a, b) => b.impressions - a.impressions);
  for (const c of crows.slice(0, 10)) {
    console.log(`  ${c.keys[0]}  → ${c.impressions} impressions, ${c.clicks} clicks`);
  }

  console.log('\n✓ Done');
}

main().catch((e) => {
  console.error('ERROR:', e.message);
  console.error('Code:', e.code);
  process.exit(1);
});
