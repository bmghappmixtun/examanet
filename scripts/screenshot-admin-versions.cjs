/**
 * Capture de la page /admin/versions sur le worker dev avec une session admin.
 * Usage : node scripts/screenshot-admin-versions.cjs <url> <cookieToken> <outfile>
 */
const { chromium } = require('playwright');
const fs = require('fs');

const URL_ = process.argv[2] || 'https://examanet-dev.examanet-poc.workers.dev/admin/versions';
const TOKEN = process.argv[3] || '';
const OUT = process.argv[4] || '/tmp/admin-versions.png';

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const ctx = await browser.newContext({
    viewport: { width: 1600, height: 1100 },
    userAgent: 'MavisProbe/1.0 (diagnostic Examanet - hors triage)',
  });
  await ctx.addCookies([
    {
      name: '__Secure-examanet_session',
      value: TOKEN,
      domain: new URL(URL_).hostname,
      path: '/',
      secure: true,
    },
  ]);
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text().slice(0, 160));
  });
  page.on('pageerror', (e) => errors.push('pageerror: ' + String(e).slice(0, 160)));

  await page.goto(URL_, { waitUntil: 'networkidle', timeout: 90000 });
  await page.waitForTimeout(1200);
  fs.mkdirSync(require('path').dirname(OUT), { recursive: true });
  await page.screenshot({ path: OUT, fullPage: false });

  // quelques assertions utiles
  const title = await page.locator('h1').first().innerText().catch(() => '');
  const live = await page
    .locator('text=Version en ligne')
    .locator('xpath=../div[2]')
    .innerText()
    .catch(() => '');
  const rows = await page.locator('table tbody tr').count();
  console.log('  h1:', title.replace(/\n/g, ' '));
  console.log('  version en ligne:', live.trim());
  console.log('  lignes du tableau:', rows);
  console.log('  erreurs console:', errors.length ? errors.slice(0, 3) : 'aucune');
  console.log('  screenshot:', OUT);
  await browser.close();
})();
