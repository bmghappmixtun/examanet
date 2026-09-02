import { test, expect } from '@playwright/test';

test('admin users page: pagination works', async ({ page }) => {
  await page.goto('/connexion');
  await page.fill('input[type="email"]', 'boutiti.mehdi@gmail.com');
  await page.fill('input[type="password"]', 'demo1234');
  await page.click('button[type="submit"]');
  await page.waitForURL(/mon-compte|admin/, { timeout: 15000 });

  await page.goto('/admin/utilisateurs?role=TEACHER&page=1&size=25');
  await page.waitForTimeout(2000);

  // Should show pagination footer
  await expect(page.locator('text=Afficher par').first()).toBeVisible({ timeout: 5000 });
  await expect(page.locator('text=Page ').first()).toBeVisible();

  // Take screenshot
  await page.screenshot({ path: 'tests/e2e/screenshots/admin-pagination-25.png', fullPage: true });

  // Click "50" size
  await page.click('button:has-text("50")');
  await page.waitForURL(/size=50/, { timeout: 5000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'tests/e2e/screenshots/admin-pagination-50.png', fullPage: true });

  // Click "10" size
  await page.click('button:has-text("10")');
  await page.waitForURL(/size=10/, { timeout: 5000 });
  await page.waitForTimeout(1500);

  // Should have multiple pages now (208 / 10 = 21 pages)
  await expect(page.locator('text=Page 1 sur').first()).toBeVisible();

  // Click next page (button:has-text suvant or chevron icon)
  await page.click('button[title="Page suivante"]');
  await page.waitForURL(/page=2/, { timeout: 5000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'tests/e2e/screenshots/admin-pagination-page2.png', fullPage: true });

  // Click "Dernière page" button
  await page.click('button[title="Dernière page"]');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'tests/e2e/screenshots/admin-pagination-last.png', fullPage: true });

  // Now click "Première page"
  await page.click('button[title="Première page"]');
  await page.waitForTimeout(1500);
});