import { test } from '@playwright/test';
const BASE = 'https://examanet.com';

test('screenshot settings', async ({ page }) => {
  await page.goto(`${BASE}/connexion`);
  await page.fill('input[type="email"]', 'ahmed.benali@examanet.com');
  await page.fill('input[type="password"]', 'demo1234');
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/enseignant/, { timeout: 15000 });

  await page.goto(`${BASE}/mon-compte/parametres`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: 'tests/e2e/screenshots/settings-profile.png', fullPage: true });

  // Navigate to teaching
  await page.locator('button', { hasText: 'Enseignement' }).first().click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'tests/e2e/screenshots/settings-teaching.png', fullPage: true });

  // Navigate to security
  await page.locator('button', { hasText: 'Sécurité' }).first().click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'tests/e2e/screenshots/settings-security.png', fullPage: true });

  console.log('Screenshots saved');
});