#!/usr/bin/env node
/**
 * Test de bout en bout du bouton bleu « Télécharger PDF ».
 *
 * 2026-11-12 — le bouton échouait (« Invalid URL » côté serveur, 502).
 * Ce script ouvre une page ressource réelle, clique sur le bouton bleu et
 * vérifie que la requête de téléchargement renvoie bien un PDF.
 *
 * Usage : node scripts/verify-download-button.cjs [url]
 */
const { chromium } = require('playwright');

const PAGE_URL = process.argv[2] || 'https://examanet.com/fr/ressources/3562';

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ acceptDownloads: true, locale: 'fr-FR' });
  const page = await ctx.newPage();

  const downloadRequests = [];
  page.on('response', (res) => {
    if (res.url().includes('/download')) {
      downloadRequests.push({ url: res.url(), status: res.status(), ct: res.headers()['content-type'] || '' });
    }
  });

  console.log(`Page : ${PAGE_URL}`);
  await page.goto(PAGE_URL, { waitUntil: 'domcontentloaded', timeout: 45000 });

  // La page ressource est rendue côté client : on attend l'hydratation et
  // l'apparition du bouton (le HTML brut ne contient que le shell).
  // Design 2027 (dev) : « Afficher le document » ; design historique (prod) :
  // « Télécharger PDF ».
  const candidates = [
    'button:has-text("Télécharger PDF")',
    'a:has-text("Télécharger PDF")',
    'button:has-text("Afficher le document")',
    'a:has-text("Afficher le document")',
  ];
  let buttonSelector = null;
  for (const sel of candidates) {
    const found = await page.locator(sel).count();
    if (found > 0) { buttonSelector = sel; break; }
    try {
      await page.waitForSelector(sel, { timeout: 8000 });
      buttonSelector = sel;
      break;
    } catch { /* suivant */ }
  }
  if (!buttonSelector) {
    console.error('✗ Aucun bouton de téléchargement (hydratation ?)');
    await browser.close();
    process.exit(1);
  }
  console.log(`Sélecteur : ${buttonSelector}`);
  await page.waitForTimeout(800);

  const button = page.locator(buttonSelector).first();
  const count = await page.locator(buttonSelector).count();
  console.log(`Boutons « Télécharger PDF » trouvés : ${count}`);

  const label = (await button.textContent()) || '';
  console.log(`Bouton cliqué : « ${label.trim()} »`);

  // Le bouton ouvre un nouvel onglet (window.open) : on l'intercepte.
  const popupPromise = ctx.waitForEvent('page', { timeout: 20000 }).catch(() => null);
  const popupResponses = [];
  const downloads = [];
  ctx.on('page', (p) => {
    p.on('response', (res) => {
      if (res.url().includes('/download')) {
        popupResponses.push({ url: res.url(), status: res.status(), ct: res.headers()['content-type'] || '' });
      }
    });
  });
  // Réponse « Content-Disposition: attachment » => le navigateur déclenche un
  // téléchargement (pas une navigation) : pas d'événement 'response'.
  ctx.on('download', async (d) => {
    downloads.push({ name: d.suggestedFilename(), url: d.url() });
    const path = await d.path().catch(() => null);
    if (path) {
      const { statSync } = require('node:fs');
      const size = statSync(path).size;
      const head = require('node:fs').readFileSync(path).subarray(0, 4).toString('latin1');
      downloads[downloads.length - 1].size = size;
      downloads[downloads.length - 1].magic = head;
    }
  });

  await button.click();
  const popup = await popupPromise;
  await page.waitForTimeout(4000);

  if (popup) {
    await popup.waitForLoadState('domcontentloaded', { timeout: 20000 }).catch(() => {});
    console.log(`Nouvel onglet : ${popup.url() || '(url non exposée)'}`);
    await popup.close().catch(() => {});
  }

  console.log('\nRequêtes /download observées (page principale) :');
  for (const r of downloadRequests) console.log(`  ${r.status} ${r.ct} ${r.url}`);
  console.log('Requêtes /download observées (nouvel onglet) :');
  for (const r of popupResponses) console.log(`  ${r.status} ${r.ct} ${r.url}`);
  console.log('Téléchargements déclenchés par le navigateur :');
  for (const d of downloads) console.log(`  ${d.name} (${d.size} octets, magic=${d.magic}) ${d.url}`);

  const all = [...downloadRequests, ...popupResponses];
  const ok =
    all.some((r) => r.status === 200 && r.ct.includes('pdf')) ||
    downloads.some((d) => d.magic && d.magic.startsWith('%PDF') && d.size > 1000);
  await browser.close();

  console.log(ok ? '\n✓ Téléchargement OK (200 + application/pdf)' : '\n✗ Téléchargement KO');
  process.exit(ok ? 0 : 1);
})();
