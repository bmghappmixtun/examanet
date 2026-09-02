import { test, expect } from '@playwright/test';

test('admin /admin/catalog page works', async ({ page }) => {
  await page.goto('/connexion');
  await page.fill('input[type="email"]', 'boutiti.mehdi@gmail.com');
  await page.fill('input[type="password"]', 'demo1234');
  await page.click('button[type="submit"]');
  await page.waitForURL(/mon-compte|admin/, { timeout: 15000 });

  // Direct navigation to /admin/catalog (the broken link)
  const response = await page.goto('/admin/catalog');
  expect(response?.status()).toBe(200);

  await expect(page.locator('h1.text-2xl.md\\:text-3xl:has-text("Catalogue de la plateforme")')).toBeVisible({ timeout: 5000 });
  await expect(page.locator('text=Matières').first()).toBeVisible();

  // Stats cards visible
  await expect(page.locator('text=Niveaux').first()).toBeVisible();
  await expect(page.locator('text=Classes').first()).toBeVisible();
  await expect(page.locator('text=Sections').first()).toBeVisible();

  await page.screenshot({ path: 'tests/e2e/screenshots/admin-catalog-page.png', fullPage: true });
});

test('teacher trying /admin/catalog is redirected to home', async ({ page }) => {
  await page.goto('/connexion');
  await page.fill('input[type="email"]', 'ahmed.benali@examanet.com');
  await page.fill('input[type="password"]', 'demo1234');
  await page.click('button[type="submit"]');
  await page.waitForURL(/mon-compte|enseignant/, { timeout: 15000 });

  // Try to access admin/catalog as teacher
  await page.goto('/admin/catalog');

  // Should be redirected to home
  await page.waitForURL(/^https?:\/\/[^\/]+\/?$|^\/$/, { timeout: 5000 });
  expect(page.url()).not.toContain('/admin/');
});