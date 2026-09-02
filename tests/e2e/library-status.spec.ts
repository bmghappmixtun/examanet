import { test, expect } from '@playwright/test';

const TEACHER_EMAIL = 'mounibtasnim@yahoo.fr';
const TEACHER_PASSWORD = 'demo1234';

test('library badges reflect the actual resource status', async ({ page }) => {
  await page.goto('/connexion');
  await page.fill('input[type="email"]', TEACHER_EMAIL);
  await page.fill('input[type="password"]', TEACHER_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/mon-compte|enseignant/, { timeout: 15000 });

  await page.goto('/enseignant/bibliotheque');
  await page.waitForLoadState('domcontentloaded');

  // Wait for files to load (client-side fetch)
  await page.waitForTimeout(2000);

  // Find the test files
  const publishedFile = page.locator('text=test-published.pdf').first();
  const pendingFile = page.locator('text=test-pending.pdf').first();
  const rejectedFile = page.locator('text=test-rejected.pdf').first();

  // For each file card, check the badge inside it
  const publishedCard = publishedFile.locator('xpath=ancestor::div[contains(@class, "rounded-xl")][1]');
  const pendingCard = pendingFile.locator('xpath=ancestor::div[contains(@class, "rounded-xl")][1]');
  const rejectedCard = rejectedFile.locator('xpath=ancestor::div[contains(@class, "rounded-xl")][1]');

  // CRITICAL: published file should show "Ressource publiée"
  await expect(publishedCard.locator('text=Ressource publiée')).toBeVisible();
  console.log('✓ test-published.pdf shows "Ressource publiée"');

  // Pending should show "En attente" not "Ressource publiée"
  await expect(pendingCard.locator('text=En attente')).toBeVisible();
  await expect(pendingCard.locator('text=Ressource publiée')).not.toBeVisible();
  console.log('✓ test-pending.pdf shows "En attente", not "Ressource publiée"');

  // Rejected should show "Brouillon / Rejeté" not "Ressource publiée"
  await expect(rejectedCard.locator('text=Brouillon')).toBeVisible();
  await expect(rejectedCard.locator('text=Ressource publiée')).not.toBeVisible();
  console.log('✓ test-rejected.pdf shows "Brouillon", not "Ressource publiée"');

  await page.screenshot({ path: 'tests/e2e/screenshots/library-badges-fixed.png', fullPage: false });
});