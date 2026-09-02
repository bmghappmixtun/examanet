import { test } from '@playwright/test';

test('debug: class select options', async ({ page }) => {
  await page.goto('/connexion');
  await page.fill('input[type="email"]', 'ahmed.benali@examanet.com');
  await page.fill('input[type="password"]', 'demo1234');
  await page.click('button[type="submit"]');
  await page.waitForURL(/mon-compte|enseignant/, { timeout: 15000 });
  await page.goto('/enseignant/ajouter');
  await page.waitForTimeout(2500);

  // Class select is nth(2)
  const classSelect = page.locator('select').nth(2);
  const classOpts = await classSelect.locator('option').allTextContents();
  const classValues = await classSelect.locator('option').evaluateAll((els: any[]) => els.map(e => e.value));
  console.log('Class options (text, value):');
  for (let i = 0; i < classOpts.length; i++) {
    console.log(`  [${i}] value='${classValues[i]}' text='${classOpts[i]}'`);
  }
});
