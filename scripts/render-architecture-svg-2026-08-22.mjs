import { chromium } from 'playwright';
const browser = await chromium.launch();
const context = await browser.newContext({ userAgent: 'MavisProbe/1.0 (diagnostic Examanet - hors triage)', viewport: { width: 1400, height: 1640 } });
const page = await context.newPage();
await page.goto('file:///workspace/edutunisie/docs/architecture.svg');
await page.screenshot({ path: '/workspace/edutunisie/docs/architecture.png', fullPage: true });
await browser.close();
console.log('PNG saved');
