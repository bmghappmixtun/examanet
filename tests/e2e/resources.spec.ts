import { test, expect } from '@playwright/test';

const BASE = process.env.BASE_URL || 'http://localhost:3000';

test.describe('Resource pages', () => {
  test('Resources list shows cards', async ({ page }) => {
    await page.goto(`${BASE}/ressources`);
    // Wait for content to load
    await page.waitForLoadState('networkidle');
    // Should show at least one resource card
    const cards = page.locator('a[href^="/ressources/"]');
    const count = await cards.count();
    expect(count).toBeGreaterThan(0);
  });

  test('Filter by type works', async ({ page }) => {
    await page.goto(`${BASE}/ressources`);
    await page.waitForLoadState('networkidle');
    // Click "Cours" filter
    const courseFilter = page.getByRole('link', { name: /^Cours$/ }).first();
    if (await courseFilter.isVisible()) {
      await courseFilter.click();
      await page.waitForLoadState('networkidle');
      await expect(page).toHaveURL(/type=COURSE/);
    }
  });

  test('Resource detail page loads', async ({ page }) => {
    await page.goto(`${BASE}/ressources`);
    await page.waitForLoadState('networkidle');
    // Click first resource
    const firstCard = page.locator('a[href^="/ressources/"]').first();
    await firstCard.click();
    await page.waitForLoadState('networkidle');
    // Should have title h1
    await expect(page.locator('h1').first()).toBeVisible();
    // Should have stats
    await expect(page.getByText(/Vues|views/i).first()).toBeVisible();
  });

  test('Comments section present on resource page', async ({ page }) => {
    await page.goto(`${BASE}/ressources`);
    await page.waitForLoadState('networkidle');
    const firstCard = page.locator('a[href^="/ressources/"]').first();
    await firstCard.click();
    await page.waitForLoadState('networkidle');
    // Should have comments title
    await expect(page.getByText(/Commentaires/i).first()).toBeVisible();
  });
});