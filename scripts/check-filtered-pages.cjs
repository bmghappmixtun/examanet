// Vérification fonctionnelle + rendu de pages filtrées (usage : node scripts/check-filtered-pages.cjs)
const { chromium } = require('playwright');

const PAGES = [
  {
    name: 'P1 devoirs HG (cycle=college)',
    url: 'https://examanet.com/fr/devoirs/histoire-geographie?cycle=college',
  },
  {
    name: 'P2 ressources (histoire + 8eme,7eme,9eme)',
    url: 'https://examanet.com/fr/ressources?subject=histoire&class=8eme,7eme,9eme',
  },
];

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  for (const p of PAGES) {
    const ctx = await browser.newContext({ ignoreHTTPSErrors: true, locale: 'fr-FR' });
    const page = await ctx.newPage();
    const logs = [];
    page.on('console', (m) => {
      if (m.type() === 'error' || m.type() === 'warning') logs.push(`[${m.type()}] ${m.text()}`);
    });
    page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));

    let status = '?';
    try {
      const r = await page.goto(p.url, { waitUntil: 'domcontentloaded', timeout: 90000 });
      status = r ? r.status() : '?';
      await page.waitForTimeout(9000);
    } catch (e) {
      logs.push(`[goto] ${e.message}`);
    }

    console.log(`\n${'='.repeat(76)}\n### ${p.name}\n   HTTP ${status}\n${'='.repeat(76)}`);

    const h1 = await page.locator('h1').first().innerText().catch(() => null);
    console.log('  H1 rendu      :', JSON.stringify(h1));

    const counts = await page.evaluate(() => {
      const links = [...document.querySelectorAll('a[href*="/ressources/"]')];
      const uniq = new Set(links.map((a) => a.getAttribute('href').split('?')[0]));
      const txt = document.body.innerText;
      return {
        liensRessource: uniq.size,
        aVisible: links.filter((a) => a.offsetParent !== null).length,
        texteLong: txt.length,
        extrait: txt.replace(/\n{2,}/g, '\n').slice(0, 1400),
      };
    });
    console.log('  liens /ressources/ :', counts.liensRessource, '| liens visibles :', counts.aVisible);
    console.log('  --- texte visible ---');
    console.log(counts.extrait.split('\n').map((l) => '    ' + l).join('\n'));

    const interesting = logs.filter((l) => !/favicon|404 \(Not Found\)|Failed to load resource/i.test(l));
    console.log('  --- console (' + interesting.length + ') ---');
    interesting.slice(0, 8).forEach((l) => console.log('    ' + l.slice(0, 260)));

    await ctx.close();
  }
  await browser.close();
})();
