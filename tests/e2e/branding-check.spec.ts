import { test, expect } from '@playwright/test';

test('brand kit visible on home + header (full logo PNG)', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  // Full logo SVG must be visible in the header (desktop)
  const fullLogo = page.locator('header img[alt="Examanet"][src*="logo-transparent.png"]');
  await expect(fullLogo).toBeVisible();

  // The logo SVG must have loaded with real dimensions
  const logoBox = await fullLogo.boundingBox();
  expect(logoBox?.width).toBeGreaterThan(80);
  expect(logoBox?.height).toBeGreaterThan(20);

  // OG image available
  const ogResp = await page.request.get('/og-image.png');
  expect(ogResp.status()).toBe(200);
  expect(Number(ogResp.headers()['content-length'])).toBeGreaterThan(50000);

  // Favicon available
  const favResp = await page.request.get('/favicon.ico');
  expect(favResp.status()).toBe(200);

  await page.screenshot({ path: 'tests/e2e/screenshots/brand-home.png', fullPage: false });
});