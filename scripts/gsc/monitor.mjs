#!/usr/bin/env node
/**
 * Daily GSC monitor — designed for cron (3am Europe/Paris).
 * Outputs a Markdown summary that can be piped to email/Slack/Discord.
 *
 * Usage:
 *   node scripts/gsc/monitor.mjs            # last 1 day
 *   node scripts/gsc/monitor.mjs 7          # last 7 days
 *
 * Output: JSON to stdout (for parsing) AND markdown to /tmp/gsc-report-{date}.md
 */
import { webmasters, auth } from '@googleapis/webmasters';
import fs from 'fs';
import path from 'path';

const SITE_URL = process.env.SITE_URL || 'https://examanet.com';
const days = parseInt(process.argv[2] || '1', 10);

function fmt(n, w) {
  return String(n).padStart(w);
}
function pct(n) {
  return (n * 100).toFixed(1);
}

async function fetchRows(gsc, dimensions, date) {
  const res = await gsc.searchanalytics.query({
    siteUrl: SITE_URL,
    requestBody: {
      startDate: date,
      endDate: date,
      dimensions,
      rowLimit: 1000,
    },
  });
  return res.data.rows || [];
}

async function fetchRange(gsc, dimensions, startDate, endDate) {
  const res = await gsc.searchanalytics.query({
    siteUrl: SITE_URL,
    requestBody: {
      startDate,
      endDate,
      dimensions,
      rowLimit: 5000,
    },
  });
  return res.data.rows || [];
}

async function main() {
  const a = new auth.GoogleAuth({
    keyFile: '/workspace/.secrets/gsc-key.json',
    scopes: ['https://www.googleapis.com/auth/webmasters.readonly'],
  });
  const gsc = webmasters({ version: 'v3', auth: a });

  // Aggregate over the period
  const endDate = new Date(Date.now() - 3 * 86400000).toISOString().slice(0, 10);
  const startDate = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);

  console.log(
    `=== GSC Daily Report ===\nSite: ${SITE_URL}\nPeriod: ${startDate} → ${endDate} (${days}d)\n`,
  );

  const queries = await fetchRange(gsc, ['query'], startDate, endDate);
  const pages = await fetchRange(gsc, ['page'], startDate, endDate);
  const countries = await fetchRange(gsc, ['country'], startDate, endDate);
  const devices = await fetchRange(gsc, ['device'], startDate, endDate);

  // Totals
  const totalClicks = queries.reduce((s, r) => s + r.clicks, 0);
  const totalImpressions = queries.reduce((s, r) => s + r.impressions, 0);
  const avgCtr = totalImpressions > 0 ? totalClicks / totalImpressions : 0;
  const avgPos =
    queries.length > 0
      ? queries.reduce((s, r) => s + r.position * r.impressions, 0) / totalImpressions
      : 0;

  console.log('=== TOTALS ===');
  console.log(`  ${fmt(totalClicks, 6)} clicks`);
  console.log(`  ${fmt(totalImpressions, 6)} impressions`);
  console.log(`  CTR avg  : ${pct(avgCtr)}%`);
  console.log(`  Position : ${avgPos.toFixed(1)}`);

  // JSON for downstream
  const report = {
    site: SITE_URL,
    period: { start: startDate, end: endDate, days },
    totals: { clicks: totalClicks, impressions: totalImpressions, ctr: avgCtr, position: avgPos },
    top_queries: queries
      .slice()
      .sort((a, b) => b.clicks - a.clicks)
      .slice(0, 20),
    top_pages: pages
      .slice()
      .sort((a, b) => b.clicks - a.clicks)
      .slice(0, 20),
    countries: countries
      .slice()
      .sort((a, b) => b.impressions - a.impressions)
      .slice(0, 10),
    devices,
  };

  // Markdown report
  const md = [];
  md.push(`# 📊 GSC Report — ${SITE_URL}`);
  md.push(`**Period**: ${startDate} → ${endDate} (${days}d)\n`);
  md.push(`## Totals`);
  md.push(`| Metric | Value |`);
  md.push(`|--------|-------|`);
  md.push(`| Clicks | **${totalClicks.toLocaleString()}** |`);
  md.push(`| Impressions | **${totalImpressions.toLocaleString()}** |`);
  md.push(`| Avg CTR | **${pct(avgCtr)}%** |`);
  md.push(`| Avg position | **${avgPos.toFixed(1)}** |\n`);

  if (queries.length > 0) {
    md.push(`## 🔥 Top queries`);
    md.push(`| Clicks | Imps | CTR | Pos | Query |`);
    md.push(`|------:|-----:|----:|----:|-------|`);
    for (const q of queries
      .slice()
      .sort((a, b) => b.clicks - a.clicks)
      .slice(0, 10)) {
      md.push(
        `| ${q.clicks} | ${q.impressions} | ${pct(q.ctr)}% | ${q.position.toFixed(1)} | \`${q.keys[0]}\` |`,
      );
    }
    md.push('');
  }

  if (pages.length > 0) {
    md.push(`## 📄 Top pages`);
    md.push(`| Clicks | Imps | CTR | Pos | URL |`);
    md.push(`|------:|-----:|----:|----:|-----|`);
    for (const p of pages
      .slice()
      .sort((a, b) => b.clicks - a.clicks)
      .slice(0, 10)) {
      const url = p.keys[0].replace(SITE_URL, '');
      md.push(
        `| ${p.clicks} | ${p.impressions} | ${pct(p.ctr)}% | ${p.position.toFixed(1)} | \`${url}\` |`,
      );
    }
    md.push('');
  }

  if (countries.length > 0) {
    md.push(`## 🌍 By country (top 5)`);
    md.push(`| Country | Impressions | Clicks |`);
    md.push(`|---------|------------:|-------:|`);
    for (const c of countries.sort((a, b) => b.impressions - a.impressions).slice(0, 5)) {
      md.push(`| ${c.keys[0]} | ${c.impressions} | ${c.clicks} |`);
    }
    md.push('');
  }

  if (devices.length > 0) {
    md.push(`## 📱 By device`);
    md.push(`| Device | Clicks | Imps | CTR |`);
    md.push(`|--------|-------:|-----:|----:|`);
    for (const d of devices) {
      md.push(`| ${d.keys[0]} | ${d.clicks} | ${d.impressions} | ${pct(d.ctr)}% |`);
    }
    md.push('');
  }

  if (queries.length === 0 && pages.length === 0) {
    md.push(`\n> ⚠️ No data yet — Google needs 48-72h to accumulate after verification.\n`);
  }

  const mdPath = `/tmp/gsc-report-${new Date().toISOString().slice(0, 10)}.md`;
  fs.writeFileSync(mdPath, md.join('\n'));

  console.log(`\n📝 Markdown report saved to ${mdPath}`);
  console.log('\n=== JSON OUTPUT (for piping) ===');
  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error('ERROR:', e.message);
  console.error('Code:', e.code);
  process.exit(1);
});
