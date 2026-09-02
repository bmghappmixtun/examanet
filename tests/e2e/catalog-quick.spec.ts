import { test, expect } from '@playwright/test';

test('debug: check 3eme vs 1ere sections', async ({ page }) => {
  await page.goto('/connexion');
  await page.fill('input[type="email"]', 'ahmed.benali@examanet.com');
  await page.fill('input[type="password"]', 'demo1234');
  await page.click('button[type="submit"]');
  await page.waitForURL(/mon-compte|enseignant/, { timeout: 15000 });

  await page.goto('/enseignant/ajouter');
  await page.waitForTimeout(2000);

  // Select 3eme-secondaire
  await page.locator('select').nth(2).selectOption('3eme-secondaire');
  await page.waitForTimeout(800);

  const sectionSelect = page.locator('select').nth(3);
  const sections3 = await sectionSelect.locator('option').allTextContents();
  console.log('3eme sections:', JSON.stringify(sections3));

  // Select 1ere-secondaire
  await page.locator('select').nth(2).selectOption('1ere-secondaire');
  await page.waitForTimeout(800);

  const sections1 = await sectionSelect.locator('option').allTextContents();
  console.log('1ere sections:', JSON.stringify(sections1));

  await page.screenshot({ path: 'tests/e2e/screenshots/catalog-debug.png', fullPage: true });
});
