import { test, expect } from '@playwright/test';

test('login page does NOT show demo credentials', async ({ page }) => {
  await page.goto('/connexion');
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(1000);

  // Should NOT have the demo accounts box
  const demoBox = page.locator('text=démo').first();
  const hasDemo = await demoBox.isVisible().catch(() => false);
  expect(hasDemo).toBe(false);

  // Should NOT see the demo emails
  await expect(page.locator('text=admin@examanet.com')).toHaveCount(0);
  await expect(page.locator('text=demo1234')).toHaveCount(0);

  await page.screenshot({ path: 'tests/e2e/screenshots/login-clean.png', fullPage: true });
});
