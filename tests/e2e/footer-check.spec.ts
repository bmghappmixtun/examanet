import { test, expect } from '@playwright/test';

test('footer logo check', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  const footer = page.locator('footer');
  await expect(footer).toBeVisible();

  // Scroll to footer
  await footer.scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);

  await page.screenshot({ path: 'tests/e2e/screenshots/footer-current.png', fullPage: false });

  // Check what's there
  const footerImg = footer.locator('img').first();
  const imgSrc = await footerImg.getAttribute('src');
  console.log('Footer img src:', imgSrc);
});
