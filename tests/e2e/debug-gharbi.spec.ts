import { test } from '@playwright/test';
const BASE = 'https://examanet.com';

test('debug gharbi profile', async ({ page }) => {
  await page.goto(`${BASE}/professeurs`);
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: 'tests/e2e/screenshots/debug-professeurs.png', fullPage: true });

  const gharbiLink = page.locator('a[href^="/professeurs/"]').filter({ hasText: /Gharbi/i }).first();
  const count = await gharbiLink.count();
  console.log('Gharbi links count:', count);

  if (count > 0) {
    await gharbiLink.click();
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: 'tests/e2e/screenshots/debug-gharbi-profile.png', fullPage: true });

    // Get text content
    const text = await page.locator('main').textContent();
    console.log('Page text content:');
    console.log(text?.slice(0, 1000));
  }
});
