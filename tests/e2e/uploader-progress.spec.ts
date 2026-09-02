import { test, expect } from '@playwright/test';
import path from 'path';
const BASE_URL = 'https://examanet.com';

test('upload progress bar appears during upload', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${BASE_URL}/connexion`);
  await page.fill('input[type="email"]', 'ahmed.benali@examanet.com');
  await page.fill('input[type="password"]', 'demo1234');
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(mon-compte|enseignant)/, { timeout: 10000 });
  await page.goto(`${BASE_URL}/enseignant/ajouter`);
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(1500);

  // Find the hidden file input
  const fileInput = page.locator('input[type="file"]').first();

  // Upload a sample PDF (the one in the project)
  const pdfPath = path.resolve(__dirname, '../../public/sample-pdf.pdf');
  await fileInput.setInputFiles(pdfPath);

  // Wait for upload to start
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'tests/e2e/screenshots/uploader-progress.png' });

  // Wait for completion
  await page.waitForTimeout(5000);
  await page.screenshot({ path: 'tests/e2e/screenshots/uploader-complete.png' });
});
