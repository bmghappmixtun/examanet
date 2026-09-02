const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  await page.goto('file:///tmp/demo/cards.html', { waitUntil: 'networkidle' });
  await page.screenshot({ path: '/tmp/demo/cards.png', fullPage: true });
  await browser.close();
  console.log('Screenshot OK');
})();
