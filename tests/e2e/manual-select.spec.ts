import { test } from '@playwright/test';

test('manual change event', async ({ page }) => {
  await page.goto('/connexion');
  await page.fill('input[type="email"]', 'ahmed.benali@examanet.com');
  await page.fill('input[type="password"]', 'demo1234');
  await page.click('button[type="submit"]');
  await page.waitForURL(/mon-compte|enseignant/, { timeout: 15000 });
  await page.goto('/enseignant/ajouter');
  await page.waitForTimeout(2500);

  // Use evaluate to directly set value AND dispatch change event
  await page.locator('select').nth(2).evaluate((el: any) => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
    setter.call(el, '3eme-secondaire');
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.waitForTimeout(1000);

  // Now check the section select
  const sections = await page.locator('select').nth(3).evaluate(el => {
    const sel = el as HTMLSelectElement;
    return Array.from(sel.options).map(o => o.textContent);
  });
  console.log(`Sections after manual change (${sections.length}):`, sections);
});
