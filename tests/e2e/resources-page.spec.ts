import { test, expect } from '@playwright/test';

const TEACHER_ID = 'cmqj8v8c90002hqfuq6knpy3k';

test('teacher resources page: header, view toggle, dynamic filters', async ({ page }) => {
  await page.goto(`/ressources?teacher=${TEACHER_ID}`);
  await page.waitForLoadState('networkidle');

  // H1 should say "Ressources de l'enseignant · Mr Gharbi"
  const h1 = await page.locator('h1').first().textContent();
  console.log('H1:', h1);
  expect(h1).toContain('Ressources de l');
  expect(h1).toContain('Ridha Gharbi');

  // View toggle visible
  await expect(page.locator('button:has-text("Miniatures")')).toBeVisible();
  await expect(page.locator('button:has-text("Liste")')).toBeVisible();

  // Only 1 type, 1 subject, 0 classes -> no filters shown
  // (only one type would be useless filter)
  const sidebar = page.locator('aside');
  await expect(sidebar).toContainText('Filtres');

  // Total count = 91
  const count = await page.locator('p:has-text("disponible")').first().textContent();
  expect(count).toMatch(/91/);

  // Screenshot in grid view
  await page.screenshot({ path: 'tests/e2e/screenshots/resources-teacher-grid.png', fullPage: false });

  // Switch to list view
  await page.click('button:has-text("Liste")');
  await page.waitForURL(/view=list/);
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: 'tests/e2e/screenshots/resources-teacher-list.png', fullPage: false });
});

test('all resources page: shows full filter set', async ({ page }) => {
  await page.goto('/ressources');
  await page.waitForLoadState('networkidle');

  // Should have all 8 types, all subjects
  const sidebar = page.locator('aside');
  await expect(sidebar).toContainText('Type');
  await expect(sidebar).toContainText('Matière');
  await expect(sidebar).toContainText('Classe');

  // Should have many options
  const typeLinks = await page.locator('aside a:has-text("Cours"), aside a:has-text("Devoir"), aside a:has-text("Série")').count();
  expect(typeLinks).toBeGreaterThan(2);
});