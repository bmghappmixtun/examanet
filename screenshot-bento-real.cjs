const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 700 } });
  await page.goto('file:///tmp/demo/bento-real.html', { waitUntil: 'networkidle' });
  await page.screenshot({ path: '/workspace/edutunisie/public/__demo-bento-real.png', fullPage: true });
  await browser.close();
  console.log('OK');
})();
