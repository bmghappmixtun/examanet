// Comparaison du contenu réel entre les deux slugs de la matière Histoire.
const { chromium } = require('playwright');

const URLS = [
  ['/fr/devoirs/histoire-geographie?cycle=college', 'histoire-geographie'],
  ['/fr/devoirs/histoire?cycle=college', 'histoire'],
  ['/fr/devoirs/histoire?cycle=lycee', 'histoire (lycée)'],
];

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  for (const [u, label] of URLS) {
    const ctx = await browser.newContext({ ignoreHTTPSErrors: true, locale: 'fr-FR' });
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', (e) => errs.push(e.message));
    let status = '?';
    try {
      const r = await page.goto('https://examanet.com' + u, { waitUntil: 'domcontentloaded', timeout: 90000 });
      status = r ? r.status() : '?';
      await page.waitForTimeout(8000);
    } catch (e) { errs.push(e.message); }

    const info = await page.evaluate(() => {
      const txt = document.body.innerText;
      const h1 = document.querySelector('h1')?.innerText || '';
      // stats = les 3 nombres du bloc hero
      const stats = [...document.querySelectorAll('h1 ~ * *, h1 + * *')].map((e) => e.innerText).filter(Boolean).slice(0, 12);
      const cards = [...document.querySelectorAll('a[href*="/ressources/"]')].map((a) => a.getAttribute('href').split('/').slice(-2)[0]);
      return {
        h1,
        bandeau: (txt.match(/Mis à jour[^\\n]*/) || [''])[0],
        stats: stats.filter((s) => s.length < 60).slice(0, 10),
        nbCartes: new Set(cards).size,
        extrait: txt.replace(/\n{2,}/g, '\n').split('\n').slice(12, 40).join(' | ').slice(0, 700),
      };
    });
    console.log(`\n${'='.repeat(76)}\n### ${label}   ${u}\n   HTTP ${status}\n${'='.repeat(76)}`);
    console.log('  H1        :', JSON.stringify(info.h1));
    console.log('  bandeau   :', info.bandeau);
    console.log('  cartes    :', info.nbCartes);
    console.log('  extrait   :', info.extrait);
    if (errs.length) console.log('  ERREURS   :', errs.slice(0, 3));
    await ctx.close();
  }
  await browser.close();
})();
