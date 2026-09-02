import { test } from '@playwright/test';

const BASE = process.env.BASE_URL || 'http://localhost:3000';

test('Screenshot admin approbations page', async ({ page }) => {
  // Login as admin
  await page.goto(`${BASE}/connexion`);
  await page.fill('input[type="email"]', 'boutiti.mehdi@gmail.com');
  await page.fill('input[type="password"]', 'demo1234');
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(admin|mon-compte)/, { timeout: 15000 });

  // Go to approbations
  await page.goto(`${BASE}/admin/approbations`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);

  // Screenshot full page
  await page.screenshot({ path: 'tests/e2e/screenshots/admin-approbations.png', fullPage: true });

  // Count items
  const teacherCards = await page.locator('text=/Demandé :/').count();
  const resourceCards = await page.locator('text=/^Par /').count();
  console.log(`Teachers pending: ${teacherCards}, Resources pending: ${resourceCards}`);

  const approveButtons = await page.locator('button', { hasText: 'Approuver' }).count();
  console.log(`Total approve buttons: ${approveButtons}`);

  // Check first approve button visibility
  const firstButton = page.locator('button', { hasText: 'Approuver' }).first();
  if (await firstButton.isVisible()) {
    const box = await firstButton.boundingBox();
    console.log('First approve button bounding box:', box);
  }
});