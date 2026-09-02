const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await page.goto('https://examanet.com/ressources', { waitUntil: 'networkidle', timeout: 60000 });
  await page.screenshot({ path: '/workspace/edutunisie/public/__demo-prod-cards.png', fullPage: false });
  await browser.close();
  console.log('OK');
})();
