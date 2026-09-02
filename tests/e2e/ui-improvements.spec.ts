import { test } from '@playwright/test';
const BASE_URL = 'https://examanet.com';

test('admin editions compact + info panel', async ({ page }) => {
  // Login admin
  await page.goto(`${BASE_URL}/connexion`);
  await page.fill('input[type="email"]', 'boutiti.mehdi@gmail.com');
  await page.fill('input[type="password"]', 'demo1234');
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(mon-compte|admin)/, { timeout: 10000 });

  // Admin editions
  await page.goto(`${BASE_URL}/admin/ressources/editions`);
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'tests/e2e/screenshots/admin-editions-compact.png', fullPage: true });

  // Resource page
  await page.goto(`${BASE_URL}/ressources`);
  await page.waitForLoadState('domcontentloaded');
  const firstResource = page.locator('a[href*="/ressources/"]').first();
  const href = await firstResource.getAttribute('href');
  if (href) {
    await page.goto(`${BASE_URL}${href}`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'tests/e2e/screenshots/resource-info-panel.png', fullPage: false });
  }
});
