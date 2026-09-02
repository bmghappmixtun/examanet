import { test } from '@playwright/test';
import path from 'path';

test('debug: capture full error when publishing', async ({ page }) => {
  const errors: any[] = [];

  page.on('response', async (res) => {
    if (res.url().includes('/api/teacher/resources') && res.request().method() === 'POST') {
      try {
        const body = await res.json();
        errors.push({ status: res.status(), body });
      } catch {
        errors.push({ status: res.status(), body: 'non-json' });
      }
    }
  });

  await page.goto('/connexion');
  await page.fill('input[type="email"]', 'prof.proton@examanet.com');
  await page.fill('input[type="password"]', 'demo1234');
  await page.click('button[type="submit"]');
  await page.waitForURL(/mon-compte|enseignant/, { timeout: 15000 });

  await page.goto('/enseignant/ajouter');
  await page.waitForTimeout(2000);

  const docxPath = path.join(__dirname, '../fixtures/test-devoir.docx');
  await page.locator('input[type="file"]').setInputFiles(docxPath);
  await page.waitForSelector('text=Fichier uploadé avec succès', { timeout: 90000 });
  await page.waitForTimeout(2000);

  // Fill form
  await page.fill('input[placeholder*="Devoir"]', 'Test debug resource');
  await page.locator('select').nth(0).selectOption('COURSE');
  await page.locator('select').nth(1).selectOption({ index: 1 });
  await page.locator('select').nth(2).selectOption({ index: 1 });

  // Click Publier
  await page.click('button:has-text("Publier la ressource")');
  await page.waitForTimeout(5000);

  console.log('=== POST /api/teacher/resources Responses ===');
  for (const e of errors) {
    console.log(`Status: ${e.status}`);
    console.log(`Body: ${JSON.stringify(e.body, null, 2).slice(0, 3000)}`);
  }
});