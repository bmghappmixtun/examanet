import { test, expect } from '@playwright/test';
test('screenshot branding', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('https://examanet.com', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('h1').first()).toBeVisible({ timeout: 15000 });
  await page.screenshot({ path: 'tests/e2e/screenshots/examanet-home.png', fullPage: false });
});
