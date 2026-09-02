import { test } from '@playwright/test';
const BASE_URL = 'https://examanet.com';

test('modern uploader', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${BASE_URL}/connexion`);
  await page.fill('input[type="email"]', 'ahmed.benali@examanet.com');
  await page.fill('input[type="password"]', 'demo1234');
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(mon-compte|enseignant)/, { timeout: 10000 });
  await page.goto(`${BASE_URL}/enseignant/ajouter`);
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'tests/e2e/screenshots/uploader-empty.png', fullPage: false });
});
