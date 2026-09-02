import { test, expect } from '@playwright/test';
const BASE_URL = 'https://examanet.com';

test('PDF thumbnails render on resources page', async ({ page }) => {
  await page.goto(`${BASE_URL}/ressources`);
  await page.waitForLoadState('domcontentloaded');
  // Wait for thumbnails to lazy load
  await page.waitForTimeout(8000);
  await page.screenshot({ path: 'tests/e2e/screenshots/ressources-thumbnails.png', fullPage: false });
});
