import { test, expect } from '@playwright/test';
import path from 'path';

test('full flow: upload docx + publish resource', async ({ page }) => {
  const errors: any[] = [];
  const responses: any[] = [];

  page.on('response', async (res) => {
    if (res.url().includes('/api/teacher/resources') && res.request().method() === 'POST') {
      try {
        const body = await res.json();
        responses.push({ status: res.status(), body });
      } catch {
        responses.push({ status: res.status(), body: 'non-json' });
      }
    }
  });

  // Login
  await page.goto('/connexion');
  await page.fill('input[type="email"]', 'ahmed.benali@examanet.com');
  await page.fill('input[type="password"]', 'demo1234');
  await page.click('button[type="submit"]');
  await page.waitForURL(/mon-compte|enseignant/, { timeout: 15000 });

  // Go to add page
  await page.goto('/enseignant/ajouter');
  await page.waitForTimeout(1500);

  // Upload .docx
  const docxPath = path.join(__dirname, '../fixtures/test-devoir.docx');
  await page.locator('input[type="file"]').setInputFiles(docxPath);
  await page.waitForSelector('text=Fichier uploadé avec succès', { timeout: 90000 });
  await page.waitForTimeout(2000);

  // Fill the form
  await page.fill('input[placeholder*="Devoir"]', 'Test publish after db fix');
  // Select subject (2nd select)
  await page.locator('select').nth(1).selectOption({ index: 1 });
  // Select class (3rd select)
  await page.locator('select').nth(2).selectOption({ index: 1 });

  // Click Publier
  await page.click('button:has-text("Publier la ressource")');
  await page.waitForTimeout(5000);

  // Print API responses
  console.log('=== POST /api/teacher/resources responses ===');
  for (const r of responses) {
    console.log(`Status: ${r.status}`);
    console.log(`Body: ${JSON.stringify(r.body).slice(0, 1000)}`);
  }

  // Should NOT have a column 'new' error
  const hasError = responses.some(r => r.body?.error?.message?.includes("column 'new'"));
  if (hasError) {
    console.log('❌ STILL HAS THE COLUMN NEW ERROR');
  } else {
    console.log('✅ No column new error');
  }

  // Check for success toast
  const successToast = await page.locator('text=approuvé').first().isVisible().catch(() => false);
  console.log('Success toast visible:', successToast);

  await page.screenshot({ path: 'tests/e2e/screenshots/publish-flow-result.png', fullPage: true });
});