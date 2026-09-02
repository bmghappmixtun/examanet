import { test } from '@playwright/test';

test('inspect React state via window', async ({ page }) => {
  // Patch the React component to expose state via window
  await page.goto('/connexion');
  await page.fill('input[type="email"]', 'ahmed.benali@examanet.com');
  await page.fill('input[type="password"]', 'demo1234');
  await page.click('button[type="submit"]');
  await page.waitForURL(/mon-compte|enseignant/, { timeout: 15000 });
  await page.goto('/enseignant/ajouter');
  await page.waitForTimeout(2500);

  // Select 3eme-secondaire
  await page.locator('select').nth(2).selectOption('3eme-secondaire');
  await page.waitForTimeout(1000);

  // Check what classSlug the section options have
  const data = await page.evaluate(() => {
    const sectionsSelect = document.querySelectorAll('select')[3] as HTMLSelectElement;
    return Array.from(sectionsSelect.options).map(o => ({
      value: o.value,
      text: o.textContent,
      classSlug: (o as any).dataset.classSlug || 'n/a'
    }));
  });
  console.log('Section options with data attrs:', JSON.stringify(data, null, 2));
});
