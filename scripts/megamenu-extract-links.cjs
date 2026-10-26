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
  // Laisse le temps à l'hydratation : un clic AVANT que React n'ait
  // attaché le onClick peut être rejoué et refermer le panneau.
  await page.waitForTimeout(4000);

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
        // VÉRIFICATION : un clic effectué AVANT l'hydratation peut être
        // rejoué par React (sélection hydration) → le panneau s'ouvre puis
        // se referme. On exige donc un panneau TOUJOURS ouvert 1 s après.
        const stillOpen = await page.locator('[role="dialog"] a[href]').count();
        if (stillOpen > 0) return true;
        console.error(`    [diag] tentative ${attempt} : le panneau s'est refermé (clic pré-hydratation rejoué) → on réessaie`);
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

  // 1. UN SEUL opening du panneau : on bascule les onglets à l'intérieur.
  //    (Ouvrir/fermer pour chaque cycle était la source d'un premier
  //    onglet vide quand le Worker est froid → extraction à 0 sans erreur.)
  if (!(await openPanel(page))) {
    console.error(`\n⚠️  Panneau du méga-menu impossible à ouvrir sur ${BASE} (hydratation ?).`);
    process.exitCode = 2;
    console.log(JSON.stringify(out, null, 2));
    await browser.close();
    return;
  }

  console.error(`    [diag] après openPanel → dialogs=${await page.locator('[role="dialog"]').count()} liens=${await page.locator('[role="dialog"] a[href]').count()}`);
  for (const cycle of ['college', 'lycee']) {
    // 2. Onglet du cycle (dans le panneau).
    // Le texte du bouton est composite (« Lycée1ère → 4ème année (Bac) »)
    // → on matche en substring, pas en exact.
    const tabLabel = cycle === 'college' ? 'Collège' : 'Lycée';
    const before = await page.locator('[role="dialog"] a[href]').count();
    const tab = page.locator('[role="dialog"] button', { hasText: tabLabel }).first();
    if (await tab.count()) {
      await tab.click({ timeout: 10000 }).catch(() => {});
      // Attendre que le contenu de l'onglet change réellement.
      await page
        .waitForFunction(
          (prev) => {
            const n = document.querySelectorAll('[role="dialog"] a[href]').length;
            return n > 0 && n !== prev;
          },
          before,
          { timeout: 20000 }
        )
        .catch(() => {});
      await page.waitForTimeout(800);
    }

    // 3. Extraire les liens du panneau uniquement
    console.error(`    [diag] cycle=${cycle} avant extraction → dialogs=${await page.locator('[role="dialog"]').count()} liens=${await page.locator('[role="dialog"] a[href]').count()}`);
    const links = await page.evaluate(() => {
      const panel = document.querySelector('[role="dialog"]');
      if (!panel) return [];
      return [...panel.querySelectorAll('a[href]')]
        .map((a) => ({
          href: a.getAttribute('href'),
          label: (a.textContent || '').trim().replace(/\s+/g, ' '),
        }))
        .filter((x) => x.href && /^\/(fr\/|ar\/)?(matieres|devoirs|series|cours|classes)\//.test(x.href));
    });
    out[cycle] = links;
    if (!links.length) {
      console.error(`\n⚠️  AUCUN lien extrait pour le cycle « ${cycle} » — extraction probablement ratée. Relancez.`);
      process.exitCode = 2;
    }
  }

  // 4. Refermer (Escape — l'état React doit suivre)
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(500);

  console.log(JSON.stringify(out, null, 2));
  await browser.close();
})().catch((e) => { console.error(e.message); process.exit(1); });
