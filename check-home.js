const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('PageError: ' + e.message));
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push('Console error: ' + msg.text());
  });
  await page.goto('https://examanet-prod.examanet-poc.workers.dev/fr', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);
  const bodyText = await page.evaluate(() => document.body.innerText);
  console.log('Body length:', bodyText.length);
  console.log('First 800 chars:');
  console.log(bodyText.substring(0, 800));
  console.log('---');
  console.log('Errors:', errors.length);
  errors.slice(0, 5).forEach(e => console.log('  ', e.substring(0, 300)));
  await browser.close();
})().catch(e => console.error('FATAL:', e.message));
