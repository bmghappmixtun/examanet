import { test } from '@playwright/test';

test('debug: filter behavior', async ({ page }) => {
  await page.goto('/connexion');
  await page.fill('input[type="email"]', 'ahmed.benali@examanet.com');
  await page.fill('input[type="password"]', 'demo1234');
  await page.click('button[type="submit"]');
  await page.waitForURL(/mon-compte|enseignant/, { timeout: 15000 });
  await page.goto('/enseignant/ajouter');
  await page.waitForTimeout(2500);

  // Click on class select to open
  const classSelect = page.locator('select').nth(2);

  // Check selected value BEFORE any change
  const beforeValue = await classSelect.evaluate(el => (el as HTMLSelectElement).value);
  console.log(`Before select: class value = "${beforeValue}"`);

  // Try with exact value match
  await classSelect.selectOption('3eme-secondaire');
  await page.waitForTimeout(500);

  const afterValue = await classSelect.evaluate(el => (el as HTMLSelectElement).value);
  console.log(`After select 3eme: class value = "${afterValue}"`);

  // Check section select - is it filtered?
  const sectionSelect = page.locator('select').nth(3);
  const sections3 = await sectionSelect.evaluate(el => {
    const sel = el as HTMLSelectElement;
    return Array.from(sel.options).map(o => ({ value: o.value, text: o.textContent }));
  });
  console.log(`3eme sections (${sections3.length}):`, JSON.stringify(sections3, null, 2));
});
