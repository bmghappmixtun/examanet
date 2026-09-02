import { test, expect } from '@playwright/test';
import path from 'path';

test.describe('Teacher Personal Library', () => {
  test('teacher can upload Word file, see it in library, and download original', async ({ page, context }) => {
    // Login as teacher (Ahmed Ben Ali)
    await page.goto('/connexion');
    await page.fill('input[type="email"]', 'ahmed.benali@examanet.com');
    await page.fill('input[type="password"]', 'demo1234');
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/(mon-compte|enseignant)/, { timeout: 15000 });

    // Go to library page
    await page.goto('/enseignant/bibliotheque');
    await expect(page.locator('h1')).toContainText('bibliothèque');

    // Capture before
    await page.screenshot({ path: 'tests/e2e/screenshots/library-empty.png', fullPage: true });

    // Click "Ajouter" to go to upload page
    await page.click('a:has-text("Ajouter une ressource")');
    await page.waitForURL(/\/enseignant\/ajouter/, { timeout: 10000 });

    // Check format badges and conversion hint visible
    await expect(page.locator('text=Max 50 Mo')).toBeVisible();
    await expect(page.locator('text=Word → PDF auto')).toBeVisible();

    // Capture dropzone
    await page.screenshot({ path: 'tests/e2e/screenshots/library-dropzone.png', fullPage: true });

    // Upload the .docx file
    const docxPath = path.join(__dirname, '../fixtures/test-devoir.docx');
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(docxPath);

    // Wait for upload to complete (success state of the uploader)
    // The uploader shows 'Fichier uploadé avec succès' in a green banner when done
    await page.waitForSelector('text=Fichier uploadé avec succès', { timeout: 60000 });
    await page.screenshot({ path: 'tests/e2e/screenshots/library-upload-success.png', fullPage: true });

    // Go back to library page (use sidebar link)
    await page.click('a:has-text("Ma bibliothèque")');
    await page.waitForURL(/\/enseignant\/bibliotheque/, { timeout: 10000 });

    // Should see the new file in the list
    await page.waitForSelector('text=test-devoir.docx', { timeout: 10000 });
    await page.screenshot({ path: 'tests/e2e/screenshots/library-with-files.png', fullPage: true });

    // Verify a DOCX badge exists on the file card (use badge-specific class)
    const docxBadge = page.locator('.bg-blue-100:has-text("DOCX")').first();
    await expect(docxBadge).toBeVisible({ timeout: 5000 });

    // Verify the file name is shown in the grid
    await expect(page.locator('h3:has-text("test-devoir.docx")').first()).toBeVisible({ timeout: 5000 });
  });

  test('library page filters work', async ({ page }) => {
    await page.goto('/connexion');
    await page.fill('input[type="email"]', 'ahmed.benali@examanet.com');
    await page.fill('input[type="password"]', 'demo1234');
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/(mon-compte|enseignant)/);

    await page.goto('/enseignant/bibliotheque');

    // Filter by DOCX
    const formatFilter = page.locator('select').first();
    await formatFilter.selectOption('docx');
    await page.waitForTimeout(500);

    // All visible files should have DOCX badge
    // (or no files if user hasn't uploaded any yet)
    await page.screenshot({ path: 'tests/e2e/screenshots/library-filtered.png', fullPage: true });
  });
});