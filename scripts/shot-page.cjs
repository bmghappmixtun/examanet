#!/usr/bin/env node
/**
 * Capture d'écran d'une page (viewport ou mobile) + contrôle de débordement.
 *
 * Usage :
 *   node scripts/shot-page.cjs <url> <sortie.png> [--w 1440] [--h 900] [--mobile] [--full]
 *
 * Exemples :
 *   node scripts/shot-page.cjs https://examanet.com/fr output/screenshots/home.png --w 1440 --h 900
 *   node scripts/shot-page.cjs https://examanet.com/fr output/screenshots/home-mobile.png --mobile
 *
 * Le contrôle de débordement horizontal (scrollWidth vs clientWidth) est
 * systématique : un badge ou une carte qui dépasse du viewport crée une
 * barre de scroll horizontale sur mobile.
 */
const { chromium, devices } = require('playwright');

(async () => {
  const args = process.argv.slice(2);
  const url = args[0];
  const out = args[1];
  const flag = (name, def) => {
    const i = args.indexOf(name);
    return i >= 0 ? Number(args[i + 1]) : def;
  };
  const mobile = args.includes('--mobile');
  const full = args.includes('--full');
  if (!url || !out) {
    console.error('usage: shot-page.cjs <url> <sortie.png> [--w N] [--h N] [--mobile] [--full]');
    process.exit(2);
  }

  const browser = await chromium.launch({ headless: true });
  const context = mobile
    ? await browser.newContext({ ...devices['iPhone 12'] })
    : await browser.newContext({
        viewport: { width: flag('--w', 1440), height: flag('--h', 900) },
        deviceScaleFactor: 1,
      });
  const page = await context.newPage();

  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e && e.message ? e.message : e)));

  await page.goto(url, { waitUntil: 'networkidle', timeout: 90_000 }).catch(() => {});
  await page.waitForTimeout(2500);
  await page.screenshot({ path: out, fullPage: full });

  const info = await page.evaluate(() => {
    const de = document.documentElement;
    const vw = de.clientWidth;
    const hors = [];
    document.querySelectorAll('main *, section *').forEach((el) => {
      const b = el.getBoundingClientRect();
      if (b.width === 0 || b.height === 0) return;
      if (b.left < -1 || b.right > vw + 1) {
        hors.push({ tag: el.tagName, cls: String(el.className || '').slice(0, 50), left: Math.round(b.left), right: Math.round(b.right) });
      }
    });
    const h1 = document.querySelector('h1');
    return {
      vw,
      scrollW: de.scrollWidth,
      debordementHorizontal: de.scrollWidth > vw + 1,
      h1: h1 ? h1.textContent.trim().slice(0, 60) : null,
      elementsHorsCadre: hors.slice(0, 5),
    };
  });

  console.log(JSON.stringify({ out, ...info, erreursConsole: errors.length, echantillon: errors.slice(0, 2) }, null, 1));
  await browser.close();
})().catch((e) => { console.error('FATAL', e); process.exit(2); });
