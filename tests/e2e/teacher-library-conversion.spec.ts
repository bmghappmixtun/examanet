import { test, expect } from '@playwright/test';
import path from 'path';

test('teacher uploads Word file and library shows PDF converted', async ({ page }) => {
  // Login as teacher
  await page.goto('/connexion');
  await page.fill('input[type="email"]', 'ahmed.benali@examanet.com');
  await page.fill('input[type="password"]', 'demo1234');
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(mon-compte|enseignant)/, { timeout: 15000 });

  // Go to add page
  await page.goto('/enseignant/ajouter');
  await expect(page.locator('text=Max 50 Mo')).toBeVisible();

  // Upload the .docx file
  const docxPath = path.join(__dirname, '../fixtures/test-devoir.docx');
  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles(docxPath);

  // Wait for upload to complete
  await page.waitForSelector('text=Fichier uploadé avec succès', { timeout: 60000 });
  await page.screenshot({ path: 'tests/e2e/screenshots/library-conversion-success.png', fullPage: true });

  // Check that the original is saved
  await expect(page.locator('text=Original sauvegardé')).toBeVisible({ timeout: 5000 });

  // Go to library
  await page.click('a:has-text("Ma bibliothèque")');
  await page.waitForURL(/\/enseignant\/bibliotheque/, { timeout: 10000 });

  // Find the latest file (test-devoir.docx) and verify it has a PDF
  await page.waitForSelector('text=test-devoir.docx', { timeout: 10000 });

  // Should have a "PDF généré" success badge
  await expect(page.locator('text=PDF généré').first()).toBeVisible({ timeout: 10000 });
  await page.screenshot({ path: 'tests/e2e/screenshots/library-with-pdf-converted.png', fullPage: true });

  // Verify the stats show "Convertis: 1" (or more)
  // The "Convertis" stat card should have a value >= 1
  const convertisCard = page.locator('text=Convertis').locator('..').locator('div').nth(1);
  const text = await convertisCard.textContent();
  console.log('Convertis stat text:', text);
  expect(parseInt(text || '0')).toBeGreaterThanOrEqual(1);
});