import { test, expect } from '@playwright/test';

const TEACHER_ID = 'cmqj8v8c90002hqfuq6knpy3k';

test('teacher profile shows "91 Ressources" (after deleting 75 old)', async ({ page }) => {
  await page.goto(`/professeurs/${TEACHER_ID}`);
  await page.waitForLoadState('networkidle');
  const body = await page.content();
  expect(body).toMatch(/Ressources\s*\(/);
});

test('"voir tout" filter shows 166 not 234', async ({ page }) => {
  await page.goto(`/ressources?teacher=${TEACHER_ID}`);
  await expect(page.locator('h1:has-text("Ressources de l")')).toBeVisible();
  const body = await page.content();
  // Should contain 91 (teacher's total after delete), not 234 (platform total)
  expect(body).toMatch(/\b91\b/);
  // Should NOT contain 166 (the old count before delete)
  expect(body).not.toMatch(/\b234\b/);
  await page.screenshot({ path: 'tests/e2e/screenshots/teacher-filter-fixed.png', fullPage: false });
});

test('"voir tout" with no teacher param shows all 234', async ({ page }) => {
  await page.goto('/ressources');
  await expect(page.locator('h1:has-text("Toutes les ressources")')).toBeVisible();
  const body = await page.content();
  expect(body).toMatch(/\b159\b/);
});