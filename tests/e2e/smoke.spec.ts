import { test, expect } from '@playwright/test';

const BASE = process.env.BASE_URL || 'http://localhost:3000';

test.describe('Smoke tests — Examanet', () => {
  test('Home page loads and shows hero', async ({ page }) => {
    await page.goto(BASE);
    await expect(page).toHaveTitle(/Examanet/);
    await expect(page.locator('h1')).toContainText(/plateforme pédagogique/i);
    await expect(page.getByText(/100% gratuits/i)).toBeVisible();
  });

  test('Navigation works: Resources page', async ({ page }) => {
    await page.goto(BASE);
    await page.click('a[href="/ressources"]');
    await page.waitForURL(/\/ressources/);
    await expect(page.locator('h1')).toBeVisible();
  });

  test('Navigation works: Subjects page', async ({ page }) => {
    await page.goto(`${BASE}/matieres`);
    await expect(page.locator('h1')).toContainText(/matières/i);
  });

  test('Navigation works: Teachers page', async ({ page }) => {
    await page.goto(`${BASE}/professeurs`);
    await expect(page.locator('h1')).toContainText(/professeurs/i);
  });

  test('Login page is accessible', async ({ page }) => {
    await page.goto(`${BASE}/connexion`);
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.getByRole('button', { name: /Se connecter|Connexion/i })).toBeVisible();
  });

  test('Signup page is accessible', async ({ page }) => {
    await page.goto(`${BASE}/inscription`);
    await expect(page.locator('input[type="email"]')).toBeVisible();
  });

  test('API: auth me returns null when not logged in', async ({ request }) => {
    const res = await request.get(`${BASE}/api/auth/me`);
    expect(res.status()).toBe(401);
  });

  test('404 page works', async ({ page }) => {
    const res = await page.goto(`${BASE}/this-does-not-exist`);
    expect(res?.status()).toBe(404);
    await expect(page.getByText(/Page introuvable/i)).toBeVisible();
  });

  test('Search input visible on home', async ({ page }) => {
    await page.goto(BASE);
    await expect(page.locator('input[placeholder*="Rechercher"]').first()).toBeVisible();
  });

  test('Language switcher works (FR ↔ AR)', async ({ page }) => {
    await page.goto(BASE);
    await page.click('button[title*="Changer"]');
    // Wait for RTL class
    await page.waitForTimeout(500);
    const isRtl = await page.evaluate(() => document.documentElement.dir === 'rtl');
    expect(isRtl).toBeTruthy();
    // Switch back
    await page.click('button[title*="Changer"]');
    await page.waitForTimeout(500);
  });

  test('Newsletter form has email input', async ({ page }) => {
    await page.goto(BASE);
    await page.locator('input[type="email"][placeholder*="email"]').first().scrollIntoViewIfNeeded();
    await expect(page.locator('input[type="email"][placeholder*="email"]').first()).toBeVisible();
  });

  test('Footer is present', async ({ page }) => {
    await page.goto(BASE);
    await expect(page.locator('footer')).toBeVisible();
    await expect(page.getByText(/Tunisie/i).first()).toBeVisible();
  });
});