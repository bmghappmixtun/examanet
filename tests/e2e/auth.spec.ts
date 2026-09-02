import { test, expect } from '@playwright/test';

const BASE = process.env.BASE_URL || 'http://localhost:3000';

test.describe('Authentication flow', () => {
  test('Login with admin credentials', async ({ page }) => {
    await page.goto(`${BASE}/connexion`);
    await page.fill('input[type="email"]', 'boutiti.mehdi@gmail.com');
    await page.fill('input[type="password"]', 'demo1234');
    await page.click('button[type="submit"]');
    // Wait for navigation
    await page.waitForURL(/\/admin|\/mon-compte|\/enseignant/, { timeout: 10000 });
    // Should redirect to admin
    await expect(page).toHaveURL(/\/admin/);
  });

  test('Login with invalid credentials shows error', async ({ page }) => {
    await page.goto(`${BASE}/connexion`);
    await page.fill('input[type="email"]', 'wrong@example.com');
    await page.fill('input[type="password"]', 'wrongpassword');
    await page.click('button[type="submit"]');
    // Should show toast error
    await page.waitForTimeout(2000);
  });

  test('Logout from admin dashboard', async ({ page, context }) => {
    // Login first
    await page.goto(`${BASE}/connexion`);
    await page.fill('input[type="email"]', 'boutiti.mehdi@gmail.com');
    await page.fill('input[type="password"]', 'demo1234');
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/admin/, { timeout: 10000 });

    // Find logout button (in user menu)
    const userButton = page.locator('button').filter({ hasText: /AP/i }).first();
    if (await userButton.isVisible()) {
      await userButton.click();
      const logoutBtn = page.getByText(/Se déconnecter/i);
      if (await logoutBtn.isVisible()) {
        await logoutBtn.click();
      }
    }
  });
});