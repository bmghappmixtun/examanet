import { test, expect } from '@playwright/test';

test('catalog: 27 subjects visible on matieres page', async ({ page }) => {
  await page.goto('/matieres');
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(1500);

  // Look for the new subjects
  await expect(page.locator('text=Algorithme et programmation').first()).toBeVisible({ timeout: 5000 });
  await expect(page.locator('text=TIC').first()).toBeVisible();
  await expect(page.locator('text=Bases de données').first()).toBeVisible();
  await expect(page.locator('text=Éducation civique').first()).toBeVisible();
  await expect(page.locator('text=Éducation islamique').first()).toBeVisible();
  await expect(page.locator('text=3ème langue').first()).toBeVisible();

  await page.screenshot({ path: 'tests/e2e/screenshots/catalog-matieres.png', fullPage: true });
});

test('teacher add page: new subjects in dropdown', async ({ page }) => {
  await page.goto('/connexion');
  await page.fill('input[type="email"]', 'ahmed.benali@examanet.com');
  await page.fill('input[type="password"]', 'demo1234');
  await page.click('button[type="submit"]');
  await page.waitForURL(/mon-compte|enseignant/, { timeout: 15000 });

  await page.goto('/enseignant/ajouter');
  await page.waitForTimeout(2000);

  // Open subject dropdown - should now have 27 options
  const subjectSelect = page.locator('select').nth(1);
  const options = await subjectSelect.locator('option').allTextContents();
  console.log(`Subject dropdown options: ${options.length}`);
  expect(options.length).toBeGreaterThanOrEqual(27);

  // Look for new subjects
  expect(options.some(o => o.includes('Algorithme'))).toBe(true);
  expect(options.some(o => o.includes('TIC'))).toBe(true);
  expect(options.some(o => o.includes('Bases de données'))).toBe(true);
  expect(options.some(o => o.includes('Éducation civique'))).toBe(true);
});
