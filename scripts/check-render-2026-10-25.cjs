#!/usr/bin/env node
/**
 * Vérifie le rendu client des pages signalées le 2026-10-25 :
 *  - /fr/devoirs/histoire-geographie?cycle=college → nombre de DEVOIRS
 *  - /fr/ressources?subject=histoire&class=8eme,7eme,9eme → nombre de cartes
 *  - stats du hero (pluriel + cohérence cycle)
 *
 * Usage: node scripts/check-render-2026-10-25.cjs [baseUrl]
 */
const { chromium } = require('playwright');

const BASE = process.argv[2] || 'https://examanet-dev.examanet-poc.workers.dev';

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const errors = [];

  const cases = [
    {
      label: 'devoirs HG collège',
      url: `${BASE}/fr/devoirs/histoire-geographie?cycle=college`,
      expect: 'nb de cartes ressource > 20',
    },
    {
      label: 'ressources HG (8eme,7eme,9eme)',
      url: `${BASE}/fr/ressources?subject=histoire-geographie&class=8eme,7eme,9eme`,
      expect: 'nb de cartes ressource > 20',
    },
  ];

  for (const c of cases) {
    const page = await ctx.newPage();
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`[${c.label}] ${m.text()}`); });
    page.on('pageerror', (e) => errors.push(`[${c.label}] PAGEERROR ${e.message}`));

    const resp = await page.goto(c.url, { waitUntil: 'networkidle', timeout: 90000 });
    await page.waitForTimeout(2500);

    const cards = await page.locator('a[href*="/fr/ressources/"]').count();
    const title = await page.title();

    // Stats du hero : on抓 les gros nombres affichés
    const heroText = await page.locator('body').innerText().catch(() => '');
    const statLines = heroText
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => /^\d[\d\s.,]*\s*(TRIMESTRES|CLASSES|RESSOURCES|DEVOIRS|SÉRIES|SERIES|COURS)/i.test(l))
      .slice(0, 8);

    console.log(`\n--- ${c.label} (HTTP ${resp.status()})`);
    console.log(`    title      : ${title}`);
    console.log(`    cartes     : ${cards}`);
    console.log(`    stats hero : ${statLines.length ? statLines.join(' | ') : '(aucune ligne stats trouvée)'}`);
    console.log(`    attendu    : ${c.expect}`);
    await page.close();
  }

  console.log(`\n=== erreurs console : ${errors.length}`);
  errors.slice(0, 10).forEach((e) => console.log('   ' + e));

  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
