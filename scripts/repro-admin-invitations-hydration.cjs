// Banc de test A/B : mismatch d'hydratation de /admin/invitations.
//   /repro-hydration-test           → sans `renderedAt` (Date.now() au rendu)
//   /repro-hydration-test?fixed=1   → avec `renderedAt` (rendu déterministe)
// Attend un `next dev` sur http://127.0.0.1:3100
const { firefox, chromium } = require('playwright');

const URLS = [
  ['SANS renderedAt (Date.now() au rendu)', 'http://127.0.0.1:3100/fr/repro-hydration-test'],
  ['AVEC renderedAt (déterministe)', 'http://127.0.0.1:3100/fr/repro-hydration-test?fixed=1'],
];

(async () => {
  // Firefox non installable dans le sandbox (dép système manquants) →
  // Chromium : la détection de mismatch de React est identique d'un navigateur à l'autre.
  for (const [browserName, launcher] of [['chromium', chromium]]) {
    console.log(`\n${'='.repeat(70)}\n### ${browserName.toUpperCase()}\n${'='.repeat(70)}`);
    const browser = await launcher.launch();
    for (const [label, url] of URLS) {
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      const logs = [];
      page.on('console', (m) => logs.push({ t: m.type(), x: m.text() }));
      page.on('pageerror', (e) => logs.push({ t: 'PAGEERROR', x: e.message }));
      let status = '?';
      try {
        const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
        status = resp ? resp.status() : '?';
        await page.waitForTimeout(9000);
      } catch (e) {
        logs.push({ t: 'GOTO_ERR', x: e.message });
      }
      const hydra = logs.filter((l) =>
        /hydrat|did not match|server rendered|#418|#419|#422|#425|Warning:/i.test(l.x),
      );
      console.log(`\n  ${label}`);
      console.log(`    HTTP ${status} | messages hydratation : ${hydra.length}`);
      hydra.slice(0, 4).forEach((l) => console.log(`      [${l.t}] ${l.x.slice(0, 420).replace(/\n/g, ' ')}`));
      await ctx.close();
    }
    await browser.close();
  }
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
