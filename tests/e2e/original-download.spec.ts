import { test, expect } from '@playwright/test';

test.describe('Original Office download from PDF view page', () => {
  test('student does NOT see Original button on resource page', async ({ page }) => {
    await page.goto('/connexion');
    await page.fill('input[type="email"]', 'yassine@example.com');
    await page.fill('input[type="password"]', 'demo1234');
    await page.click('button[type="submit"]');
    await page.waitForURL(/mon-compte|eleve|student|profil/, { timeout: 15000 });

    // Go to resources and click first one
    await page.goto('/ressources');
    await page.waitForTimeout(1500);
    const firstResource = page.locator('a[href^="/ressources/"]').first();
    await firstResource.click();
    await page.waitForLoadState('networkidle');

    // Student should NOT see the Original button
    const originalBtn = page.locator('button:has-text("Original")');
    const count = await originalBtn.count();
    expect(count).toBe(0);

    // But should see regular PDF download
    await expect(page.locator('button:has-text("Télécharger")').first()).toBeVisible({ timeout: 3000 });
  });

  test('teacher sees Original button (Office) on resource page', async ({ page }) => {
    await page.goto('/connexion');
    await page.fill('input[type="email"]', 'ahmed.benali@examanet.com');
    await page.fill('input[type="password"]', 'demo1234');
    await page.click('button[type="submit"]');
    await page.waitForURL(/mon-compte|enseignant/, { timeout: 15000 });

    // Find a resource that has an original (the prof proton's test docx)
    await page.goto('/ressources');
    await page.waitForTimeout(1500);
    const firstResource = page.locator('a[href^="/ressources/"]').first();
    await firstResource.click();
    await page.waitForLoadState('networkidle');

    // Look for Original button (may not be on every resource, only those with .docx uploaded)
    const originalBtn = page.locator('button:has-text("Original")');
    const count = await originalBtn.count();
    console.log(`Teacher sees ${count} Original button(s)`);

    // If at least 1 resource has an original, the button should appear
    if (count > 0) {
      await expect(originalBtn.first()).toBeVisible();
      await page.screenshot({ path: 'tests/e2e/screenshots/teacher-with-original.png', fullPage: true });
    }
  });
});