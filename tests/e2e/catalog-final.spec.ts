import { test, expect } from '@playwright/test';

test('Phase 2 + 3: full catalog verification', async ({ page }) => {
  // 1. Login as teacher
  await page.goto('/connexion');
  await page.fill('input[type="email"]', 'ahmed.benali@examanet.com');
  await page.fill('input[type="password"]', 'demo1234');
  await page.click('button[type="submit"]');
  await page.waitForURL(/mon-compte|enseignant/, { timeout: 15000 });

  // 2. Go to add page and check section dropdown
  await page.goto('/enseignant/ajouter');
  await page.waitForTimeout(1500);

  // Select 3eme-secondaire
  await page.locator('select').nth(2).selectOption('3eme-secondaire');
  await page.waitForTimeout(500);

  // Verify Sport section appears in section dropdown
  const sectionSelect = page.locator('select').nth(3);
  const sectionOptions = await sectionSelect.locator('option').allTextContents();
  console.log(`3eme-secondaire sections: ${sectionOptions.length}`);
  console.log(sectionOptions.join(', '));
  expect(sectionOptions.some((o) => o.includes('Sport'))).toBe(true);
  expect(sectionOptions.some((o) => o.includes('Sciences de l\'informatique'))).toBe(true);

  // 3. Select 1ere-secondaire and verify NO Sport
  await page.locator('select').nth(2).selectOption('1ere-secondaire');
  await page.waitForTimeout(500);

  const sections1ere = await sectionSelect.locator('option').allTextContents();
  console.log(`1ere-secondaire sections: ${sections1ere.length}`);
  expect(sections1ere.some((o) => o.includes('Sport'))).toBe(false);

  // 4. Take screenshot of section dropdown for 3eme
  await page.locator('select').nth(2).selectOption('3eme-secondaire');
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'tests/e2e/screenshots/catalog-3eme-sections.png', fullPage: true });
});

test('Phase 2: Éducation artistique replaces Arts Plastiques', async ({ page }) => {
  await page.goto('/matieres');
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(1500);

  // Should have Éducation artistique
  await expect(page.locator('text=Éducation artistique').first()).toBeVisible();

  // Should NOT have Arts Plastiques
  const artsCount = await page.locator('text=Arts Plastiques').count();
  expect(artsCount).toBe(0);
});