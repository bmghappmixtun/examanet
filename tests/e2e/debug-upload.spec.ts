import { test, expect } from '@playwright/test';
import path from 'path';

test('debug: capture upload API response', async ({ page }) => {
  const responses: any[] = [];

  page.on('response', async (res) => {
    if (res.url().includes('/api/teacher/files/upload')) {
      try {
        const body = await res.json();
        responses.push({ status: res.status(), body });
      } catch {
        responses.push({ status: res.status(), body: 'non-json' });
      }
    }
  });

  await page.goto('/connexion');
  await page.fill('input[type="email"]', 'ahmed.benali@examanet.com');
  await page.fill('input[type="password"]', 'demo1234');
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(mon-compte|enseignant)/, { timeout: 15000 });

  await page.goto('/enseignant/ajouter');

  const docxPath = path.join(__dirname, '../fixtures/test-devoir.docx');
  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles(docxPath);

  // Wait for upload to complete
  await page.waitForSelector('text=Fichier uploadé avec succès', { timeout: 90000 });
  await page.waitForTimeout(3000); // let any extra responses come in

  console.log('=== Upload API Responses ===');
  for (const r of responses) {
    console.log(`Status: ${r.status}`);
    console.log(`Body: ${JSON.stringify(r.body, null, 2).slice(0, 2000)}`);
  }
});