// Repro hydration #425/#422 en mode dev (React affiche le diff exact).
const { chromium } = require('playwright');

const SLUG_3562 = encodeURIComponent(
  'فرض-تأليفي-عدد-3-دراســـــة-النــــــص-التاسعة-أساسي-يقظة-الإحساس-والفن'
);

const URLS = [
  ['home', 'http://127.0.0.1:3100/fr'],
  ['ressources-3562-ar', `http://127.0.0.1:3100/fr/ressources/3562/${SLUG_3562}`],
  ['ressources-3209-en', 'http://127.0.0.1:3100/fr/ressources/3209/devoir-de-contrôle-n1-anglais-9eme-la-famille-et-ses-relations-3209'],
  ['classes-hub', 'http://127.0.0.1:3100/fr/classes'],
];

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  for (const [name, url] of URLS) {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const logs = [];
    page.on('console', (m) => logs.push({ t: m.type(), x: m.text() }));
    page.on('pageerror', (e) => logs.push({ t: 'PAGEERROR', x: e.message + '\n' + (e.stack || '') }));
    let status = '?';
    try {
      const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
      status = resp ? resp.status() : '?';
      await page.waitForTimeout(6000);
    } catch (e) {
      logs.push({ t: 'GOTO_ERR', x: e.message });
    }
    console.log(`\n${'='.repeat(72)}\n### ${name}  [HTTP ${status}]\n${'='.repeat(72)}`);
    const interesting = logs.filter(
      (l) =>
        /hydrat|did not match|server rendered|#425|#422|#418|#419|Warning:|Error:|minified|recoverable/i.test(l.x)
    );
    if (!interesting.length) {
      console.log('  (aucun message hydratation/error)');
      const errs = logs.filter((l) => l.t === 'error' || l.t === 'PAGEERROR' || l.t === 'GOTO_ERR');
      errs.slice(0, 4).forEach((l) => console.log(`  [${l.t}] ${l.x.slice(0, 400)}`));
    } else {
      interesting.slice(0, 6).forEach((l) => {
        console.log(`\n  [${l.t}] ${l.x.slice(0, 2600)}`);
      });
    }
    await ctx.close();
  }
  await browser.close();
})();
