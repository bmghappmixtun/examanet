import { test } from '@playwright/test';

test('check section dropdown state', async ({ page }) => {
  await page.goto('/connexion');
  await page.fill('input[type="email"]', 'ahmed.benali@examanet.com');
  await page.fill('input[type="password"]', 'demo1234');
  await page.click('button[type="submit"]');
  await page.waitForURL(/mon-compte|enseignant/, { timeout: 15000 });
  await page.goto('/enseignant/ajouter');
  await page.waitForTimeout(2500);

  // Check the raw HTML of section select
  const html = await page.locator('select').nth(3).evaluate(el => el.outerHTML);
  console.log('Section select initial HTML (first 2000 chars):');
  console.log(html.substring(0, 2000));

  // Now try selecting a class
  console.log('\n=== After selecting 3eme-secondaire ===');
  await page.locator('select').nth(2).selectOption('3eme-secondaire');
  await page.waitForTimeout(1500);

  const htmlAfter = await page.locator('select').nth(3).evaluate(el => el.outerHTML);
  console.log('Section select after HTML (first 2000 chars):');
  console.log(htmlAfter.substring(0, 2000));
});
