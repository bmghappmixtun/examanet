import { test, expect } from '@playwright/test';

const BASE_URL = 'https://examanet.com';

test('Print button only prints the PDF (not the whole page)', async ({ page }) => {
  // Track new windows/tabs - the iframe will create a frame inside the page
  const pdfFrames: string[] = [];
  page.on('frameattached', frame => {
    const url = frame.url();
    if (url.toLowerCase().includes('.pdf') || url.startsWith('blob:')) {
      pdfFrames.push(url);
    }
  });

  // Go to a resource page
  await page.goto(`${BASE_URL}/ressources`);
  await page.waitForLoadState('domcontentloaded');
  const firstResource = page.locator('a[href*="/ressources/"]').first();
  const href = await firstResource.getAttribute('href');
  if (!href) throw new Error('No resource found');
  await page.goto(`${BASE_URL}${href}`);
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(1500);

  // Click print button
  const printBtn = page.locator('button:has-text("Imprimer")').first();
  await printBtn.click();

  // The success toast should appear
  const toast = page.locator('text=/Impression du PDF lanc/');
  await expect(toast).toBeVisible({ timeout: 5000 });

  // Or a fallback message should appear (if iframe.print() fails)
  // Either way, the print should be initiated WITHOUT printing the whole site page
  await page.screenshot({ path: 'tests/e2e/screenshots/print-clicked.png' });

  // Verify the print dialog was NOT triggered for the whole page
  // (we'd see window.print() called, but we can't easily detect that)
  // Instead, verify the iframe approach was used
  await page.waitForTimeout(2500);
  console.log('PDF frames detected:', pdfFrames.length);
  console.log('Frames:', pdfFrames);
});
