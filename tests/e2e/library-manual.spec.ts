import { test } from '@playwright/test';

test('manual library screenshot', async ({ page }) => {
  await page.goto('/connexion');
  await page.fill('input[type="email"]', 'ahmed.benali@examanet.com');
  await page.fill('input[type="password"]', 'demo1234');
  await page.click('button[type="submit"]');
  await page.waitForURL(/mon-compte|enseignant/, { timeout: 15000 });
  await page.goto('/enseignant/bibliotheque');
  await page.waitForTimeout(2500);
  await page.screenshot({ path: 'tests/e2e/screenshots/library-final.png', fullPage: true });
});
