import { test, expect } from '@playwright/test';
test('favicon is just the pencil icon', async ({ page, context }) => {
  const response = await page.goto('/');
  // Find the favicon link
  const iconLink = await page.locator('link[rel*="icon"]').first().getAttribute('href');
  console.log('Icon link:', iconLink);
  expect(iconLink).toBeTruthy();
  
  // Check favicon.ico is the icon (single icon, not the full logo with wordmark)
  const icoResp = await page.request.get('/favicon.ico');
  expect(icoResp.status()).toBe(200);
  // The icon-transparent.png is 280KB, the favicon.ico should be small (just the icon)
  expect(Number(icoResp.headers()['content-length'])).toBeLessThan(10000);
  
  // Visual: navigate to favicon.ico to make sure it serves
  await page.goto('/favicon.ico');
  expect(page.url()).toContain('favicon.ico');
});
