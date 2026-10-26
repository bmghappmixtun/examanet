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

  /**
   * Ouvre le panneau du méga-menu en attendant l'HYDRATATION.
   *
   * Piège du 2026-10-26 : sur la prod (page ~400 Ko), l'hydratation prend
   * > 2,5 s. Un clic effectué AVANT que React n'ait attaché le onClick ne
   * fait rien → aucun panneau → `waitForSelector` expire après 20 s et
   * l'extraction sort VIDE, sans erreur visible. On clique donc en retry
   * jusqu'à ce que le panneau apparaisse.
   *
   * On ne supprime JAMAIS le nœud `[role="dialog"]` du DOM pour « fermer »
   * le panneau : React garderait l'état « ouvert » et le clic suivant le
   * refermerait. On utilise Escape, et en dernier recours un rechargement.
   */
  const openPanel = async (page) => {
    for (let attempt = 1; attempt <= 6; attempt++) {
      // 1. Fermer proprement le panneau s'il est ouvert (Escape : l'état
      //    React doit suivre, sinon le clic suivant le refermerait)
      if (await page.locator('[role="dialog"]').count()) {
        await page.keyboard.press('Escape').catch(() => {});
        await page.waitForTimeout(800);
        if (await page.locator('[role="dialog"]').count()) {
          await page.reload({ waitUntil: 'domcontentloaded', timeout: 90000 });
          await page.waitForTimeout(5000);
        }
      }

      // 2. Cliquer le déclencheur (retry : avant l'hydratation, le onClick
      //    n'est pas attaché → le clic ne fait RIEN)
      await page
        .locator('[aria-haspopup="dialog"]')
        .first()
        .click({ timeout: 15000 })
        .catch(() => {});

      // 3. Le panneau s'ouvre VIDE puis se remplit (fetch client de
      //    /api/matieres/list). Mesuré en prod : panneau à 317 ms, liens à
      //    824 ms. On attend les LIENS, pas une durée fixe.
      try {
        await page.waitForSelector('[role="dialog"]', { timeout: 5000 });
        await page
          .waitForFunction(
            () => document.querySelectorAll('[role="dialog"] a[href]').length > 0,
            { timeout: 20000 }
          );
        await page.waitForTimeout(1000);
        return true;
      } catch {
        // Panneau vide ou pas ouvert → on referme et on réessaie.
        if (await page.locator('[role="dialog"]').count()) {
          await page.keyboard.press('Escape').catch(() => {});
          await page.waitForTimeout(600);
        }
        await page.waitForTimeout(2500);
      }
    }
    return false;
  };

  const out = { college: [], lycee: [] };

  for (const cycle of ['college', 'lycee']) {
    // 1. Ouvrir le panneau (attend l'hydratation)
    if (!(await openPanel(page))) {
      console.error(`\n⚠️  Panneau du méga-menu impossible à ouvrir sur ${BASE} (hydratation ?).`);
      process.exitCode = 2;
      break;
    }

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

    // 4. Refermer (Escape — l'état React doit suivre, sinon le clic suivant
    //    refermerait un panneau déjà ouvert)
    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(700);
    if (await page.locator('[role="dialog"]').count()) {
      const close = page.locator('[role="dialog"] [aria-label="Fermer"]').first();
      if (await close.count()) await close.click({ timeout: 8000 }).catch(() => {});
      await page.waitForTimeout(700);
    }
  }

  console.log(JSON.stringify(out, null, 2));
  await browser.close();
})().catch((e) => { console.error(e.message); process.exit(1); });
