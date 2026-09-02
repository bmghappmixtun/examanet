import { chromium } from 'playwright';

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2, // High DPI for crisp output
});
const page = await context.newPage();
await page.goto('file:///workspace/edutunisie/docs/architecture.html', { waitUntil: 'networkidle' });
// Full page screenshot
await page.screenshot({ path: '/workspace/edutunisie/docs/architecture-full.png', fullPage: true });
// Just the top portion (above the fold)
await page.screenshot({ path: '/workspace/edutunisie/docs/architecture-top.png' });
await browser.close();
console.log('Screenshots saved');
