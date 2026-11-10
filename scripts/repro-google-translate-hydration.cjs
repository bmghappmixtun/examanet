#!/usr/bin/env node
/**
 * Reproduit le crash d'hydratation provoqué par Google Translate.
 *
 * Contexte (nightly #27, 2026-11-10) :
 *   - "Failed to execute 'removeChild' on 'Node'" puis
 *     "Cannot read properties of null (reading 'get')"
 *   sur /fr/ressources?class=4eme-secondaire&section=sciences-experimentales
 *
 * Mécanique réelle (observée dans les breadcrumbs ErrorLog) :
 *   Google Translate réécrit le DOM en remplaçant chaque nœud texte par un
 *   <font style="...">texte traduit</font>. React hydrate ensuite un arbre
 *   différent de celui du serveur → #418/#422 → le client re-rend le root →
 *   React appelle removeChild() sur un nœud que Google Translate a déjà
 *   déplacé → NotFoundError → remount → le routeur reçoit
 *   initialParallelRoutes === null → `t.parallelRoutes.get(c)` → TypeError.
 *
 * Simulation : on retarde le chargement des chunks Next.js (route Playwright)
 * et on applique la mutation GT au DOMContentLoaded, donc AVANT l'hydratation.
 *
 * Usage :
 *   node scripts/repro-google-translate-hydration.cjs <url> [--respect-translate-no]
 *
 * Sortie : JSON { url, simulated, removeChild, hydrationErrors, nullGet, errors[] }
 */
const { chromium } = require('playwright');

const url = process.argv[2] || 'https://examanet-dev.examanet-poc.workers.dev/fr/ressources';
const respectTranslateNo = process.argv.includes('--respect-translate-no');
const HEADLESS = !process.argv.includes('--headed');

(async () => {
  const browser = await chromium.launch({ headless: HEADLESS });
  const context = await browser.newContext({ locale: 'fr-FR' });
  const page = await context.newPage();

  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => pageErrors.push(String(e && e.message ? e.message : e)));

  const phase = process.argv.includes('--pre-hydration') ? 'pre' : 'post';

  // Phase "pre" : on retarde les chunks pour muter le DOM AVANT l'hydratation
  // (→ mismatch #418/#423). Phase "post" (défaut, le cas réel) : la mutation
  // arrive après l'hydratation, comme Google Translate au chargement.
  if (phase === 'pre') {
    await page.route('**/_next/static/chunks/**', async (route) => {
      await new Promise((r) => setTimeout(r, 1500));
      await route.continue();
    });
  }

  // 2) Mutation GT.
  //    phase "pre"  → au DOMContentLoaded (avant les chunks, donc avant l'hydratation)
  //    phase "post" → après l'hydratation (comportement réel de Google Translate)
  const injectTranslateNo = process.argv.includes('--inject-translate-no');
  await page.addInitScript(({ respect, phase }) => {
    const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA']);
    const wrapTextNodes = () => {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
          const parent = node.parentElement;
          if (!parent) return NodeFilter.FILTER_REJECT;
          if (SKIP_TAGS.has(parent.tagName)) return NodeFilter.FILTER_REJECT;
          if (parent.closest('font')) return NodeFilter.FILTER_REJECT;
          if (!node.nodeValue || node.nodeValue.trim().length < 2) return NodeFilter.FILTER_REJECT;
          if (respect && parent.closest('[translate="no"]')) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        },
      });
      const targets = [];
      while (walker.nextNode()) targets.push(walker.currentNode);
      for (const textNode of targets) {
        const font = document.createElement('font');
        font.setAttribute('style', 'vertical-align: inherit;');
        // Google Translate DÉPLACE le nœud texte dans un <font> (il ne le
        // remplace pas) puis y écrit la traduction. React garde une référence
        // sur ce nœud texte et, au démontage, appelle
        // parentDOriginne.removeChild(noeudTexte) → le nœud n'est plus un
        // enfant de son parent d'origine (c'est le <font>) → NotFoundError.
        try {
          textNode.parentNode.insertBefore(font, textNode);
          font.appendChild(textNode);          // déplacement réel du nœud
          textNode.nodeValue = textNode.nodeValue; // texte traduit par GT
        } catch (_) { /* noop */ }
      }

      // Google Translate reconstruit le DOM : les marqueurs de commentaires
      // React/Next (<!--$-->, <!--/$-->, <!--$!-->) sont SUPPRIMÉS. React les
      // supprime ensuite via `e.parentNode.removeChild(n)` (nodeType 8 =
      // COMMENT_NODE) → le nœud n'est plus un enfant → NotFoundError.
      // GT respecte translate="no" → si la page est protégée, il ne touche
      // ni au texte ni aux marqueurs de commentaires.
      if (!respect) {
        const comments = [];
        const walker2 = document.createTreeWalker(document.body, NodeFilter.SHOW_COMMENT);
        while (walker2.nextNode()) comments.push(walker2.currentNode);
        for (const c of comments) {
          try { c.parentNode.removeChild(c); } catch (_) { /* noop */ }
        }
        return targets.length + comments.length;
      }
      return targets.length + comments.length;
    };
    window.__GT_WRAPPED__ = 0;
    window.__GT_WRAP__ = wrapTextNodes;
    const applyTranslateNo = () => {
      if (window.__INJECT_TRANSLATE_NO__) {
        // Simule le correctif déployé : <html translate="no"> + meta notranslate.
        try { document.documentElement.setAttribute('translate', 'no'); } catch (_) { /* noop */ }
      }
    };
    document.addEventListener('DOMContentLoaded', () => {
      applyTranslateNo();
      if (phase === 'pre') window.__GT_WRAPPED__ = wrapTextNodes();
    }, { once: true });
  }, { respect: respectTranslateNo || injectTranslateNo, phase });
  await page.addInitScript(() => { window.__INJECT_TRANSLATE_NO__ = true; });

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90_000 });

  if (phase === 'post') {
    // Laisser l'hydratation se terminer, puis traduire (comme GT au chargement).
    await page.waitForTimeout(5000);
    await page.evaluate(() => { window.__GT_WRAPPED__ = window.__GT_WRAP__(); });
    await page.waitForTimeout(500);
  } else {
    await page.waitForTimeout(9000);
  }

  // Interaction : navigation client-side (comme dans les breadcrumbs prod :
  // popstate/pushState). La navigation démonte la Suspense boundary de
  // l'ancienne route → React supprime son marqueur de commentaire
  // <!--/$--> → si Google Translate l'a déjà supprimé → removeChild échoue.
  let clicked = null;
  let toggled = false;
  try {
    const link = page.locator('a[href*="/fr/ressources/"]').first();
    if (await link.count()) {
      clicked = (await link.textContent() || '').trim().slice(0, 50);
      await link.click({ timeout: 8000, force: true });
      toggled = true;
      await page.waitForTimeout(6000);
    }
  } catch (e) { /* le clic peut échouer si le noeud a bougé */ }

  const wrapped = await page.evaluate(() => window.__GT_WRAPPED__ || 0);
  const fontCount = await page.evaluate(() => document.querySelectorAll('font').length);
  const all = [...pageErrors, ...consoleErrors];
  const text = all.join('\n');

  const result = {
    url,
    phase,
    clickedChip: clicked,
    toggledOff: toggled,
    simulated: wrapped,
    fontElementsInDom: fontCount,
    respectTranslateNo,
    injectTranslateNo,
    removeChild: /removeChild/.test(text),
    nullGet: /reading 'get'|reading "get"/.test(text),
    hydrationErrors: (text.match(/React error #(418|422|423|425)/g) || []).length,
    errors: all.slice(0, 8),
  };
  console.log(JSON.stringify(result, null, 2));

  await browser.close();
  process.exit(result.removeChild || result.nullGet ? 1 : 0);
})().catch((e) => { console.error('FATAL', e); process.exit(2); });
