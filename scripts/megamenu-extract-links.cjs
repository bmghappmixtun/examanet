#!/usr/bin/env node
/**
 * Extrait les liens RÉELS du méga-menu « Catalogue » (MenuMatieresCollegeLycee)
 * sur le site live, pour les 2 cycles (collège / lycée).
 *
 * Le panneau est un role="dialog" aria-label="Matières par cycle" ; les onglets
 * de cycle sont à l'intérieur. On ouvre → on clique l'onglet → on extrait →
 * on referme, puis on recommence pour l'autre cycle.
 *
 * Sortie : JSON { college: [...], lycee: [...] } sur stdout.
 */
const { chromium } = require('playwright');

const BASE = process.argv[2] || 'https://examanet.com';

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1680, height: 1200 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/fr`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForTimeout(2500);

  const out = { college: [], lycee: [] };

  for (const cycle of ['college', 'lycee']) {
    // 0. S'assurer que le panneau est FERMÉ avant de cliquer le déclencheur
    //    (sinon le clic le referme et l'extraction ne trouve rien → 0 lien
    //    silencieusement, sans erreur). Observé le 2026-10-26.
    if (await page.locator('[role="dialog"]').count()) {
      await page.keyboard.press('Escape').catch(() => {});
      await page.waitForTimeout(600);
      await page.evaluate(() => {
        document.querySelectorAll('[role="dialog"]').forEach((d) => d.remove());
      });
      await page.waitForTimeout(300);
    }

    // 1. Ouvrir le panneau
    await page.locator('[aria-haspopup="dialog"]').first().click({ timeout: 20000 });
    await page.waitForSelector('[role="dialog"]', { timeout: 20000 });
    await page.waitForTimeout(1500);

    // 2. Onglet du cycle (dans le panneau)
    // Le texte du bouton est composite (« Lycée1ère → 4ème année (Bac) »)
    // → on matche en substring, pas en exact.
    const tabLabel = cycle === 'college' ? 'Collège' : 'Lycée';
    const tab = page.locator('[role="dialog"] button', { hasText: tabLabel }).first();
    if (await tab.count()) {
      await tab.click({ timeout: 10000 }).catch(() => {});
      await page.waitForTimeout(1500);
    }

    // 3. Extraire les liens du panneau uniquement
    const links = await page.evaluate(() => {
      const panel = document.querySelector('[role="dialog"]');
      if (!panel) return [];
      return [...panel.querySelectorAll('a[href]')]
        .map((a) => ({
          href: a.getAttribute('href'),
          label: (a.textContent || '').trim().replace(/\s+/g, ' '),
        }))
        .filter((x) => x.href && /^\/(fr\/)?(matieres|devoirs|series|cours|classes)\//.test(x.href));
    });
    out[cycle] = links;
    if (!links.length) {
      console.error(`\n⚠️  AUCUN lien extrait pour le cycle « ${cycle} » — extraction probablement ratée (panneau non ouvert ?). Relancez.`);
      process.exitCode = 2;
    }

    // 4. Refermer
    const close = page.locator('[role="dialog"] [aria-label="Fermer"]').first();
    if (await close.count()) await close.click({ timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(700);
  }

  console.log(JSON.stringify(out, null, 2));
  await browser.close();
})().catch((e) => { console.error(e.message); process.exit(1); });
