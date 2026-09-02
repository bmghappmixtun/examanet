import { test, expect } from '@playwright/test';

test('debug: why 1ere has Sport option', async ({ page }) => {
  await page.goto('/connexion');
  await page.fill('input[type="email"]', 'ahmed.benali@examanet.com');
  await page.fill('input[type="password"]', 'demo1234');
  await page.click('button[type="submit"]');
  await page.waitForURL(/mon-compte|enseignant/, { timeout: 15000 });

  await page.goto('/enseignant/ajouter');
  await page.waitForTimeout(2500);

  // Check how many selects exist
  const selects = await page.locator('select').count();
  console.log(`Total selects on page: ${selects}`);

  // Get all select details
  for (let i = 0; i < selects; i++) {
    const sel = page.locator('select').nth(i);
    const opts = await sel.locator('option').allTextContents();
    console.log(`Select #${i}: ${opts.length} options`);
  }

  // The class select is what?
  // 0: Type, 1: Subject, 2: Class, 3: Section
  await page.locator('select').nth(2).selectOption('1ere-secondaire');
  await page.waitForTimeout(1500);

  // Check section select after
  const sectionSel = page.locator('select').nth(3);
  const sectionOpts = await sectionSel.locator('option').allTextContents();
  console.log(`After selecting 1ere, section options: ${sectionOpts.length}`);
  console.log(JSON.stringify(sectionOpts));
});
