const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.goto('https://examanet.com/ressources?nocache=' + Date.now(), { 
    waitUntil: 'networkidle', 
    timeout: 90000,
  });
  // Zoom in on the first card
  const card = page.locator('a[href^="/ressources/"]').first();
  await card.screenshot({ path: '/workspace/edutunisie/public/__demo-bento-card-zoom.png' });
  // And the first row
  const grid = page.locator('div.grid.sm\\:grid-cols-2').first();
  await grid.screenshot({ path: '/workspace/edutunisie/public/__demo-bento-row-zoom.png' });
  await browser.close();
  console.log('OK');
})();
