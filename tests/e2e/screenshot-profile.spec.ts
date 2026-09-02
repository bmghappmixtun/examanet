import { test } from '@playwright/test';
const BASE = process.env.BASE_URL || 'http://localhost:3000';

test('Screenshot teacher profile page', async ({ page }) => {
  await page.goto(`${BASE}/professeurs`);
  await page.waitForLoadState('networkidle');
  // Find first teacher link
  const link = page.locator('a[href^="/professeurs/"]:not([href$="/page"])').first();
  const href = await link.getAttribute('href');
  await page.goto(`${BASE}${href}`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'tests/e2e/screenshots/teacher-profile.png', fullPage: true });
  console.log('Saved:', href);
});
