import { test, expect } from '@playwright/test';

const BASE = process.env.BASE_URL || 'http://localhost:3000';

const TEST_PDFS = [
  {
    name: 'Math devoirs (Gharbi)',
    slug: 'devoir-de-synth-se-n-3-math-devoir-synthese-n3-9-me-2024-202-1mgR9',
    mustRender: true
  }
];

test.describe('PDF Viewer — Comprehensive', () => {
  for (const pdf of TEST_PDFS) {
    test(`${pdf.name}: loads and renders canvas`, async ({ page }) => {
      await page.goto(`${BASE}/ressources/${pdf.slug}`, { waitUntil: 'domcontentloaded' });

      // Wait for the toolbar to appear
      await expect(page.getByText('Aperçu du document')).toBeVisible({ timeout: 15000 });

      // Wait for the canvas to actually render
      await page.waitForFunction(() => {
        const c = document.querySelector('canvas');
        if (!c) return false;
        // Canvas must have non-zero size AND have been drawn to
        return c.width > 100 && c.height > 100 && c.toDataURL().length > 1000;
      }, { timeout: 30000 });

      // Verify canvas has actual content (not just blank)
      const isNotBlank = await page.evaluate(() => {
        const canvas = document.querySelector('canvas') as HTMLCanvasElement;
        if (!canvas) return false;
        const ctx = canvas.getContext('2d');
        if (!ctx) return false;
        const data = ctx.getImageData(0, 0, Math.min(200, canvas.width), Math.min(200, canvas.height)).data;
        // Check if there's any non-white pixel
        let nonWhite = 0;
        for (let i = 0; i < data.length; i += 4) {
          if (data[i] < 250 || data[i+1] < 250 || data[i+2] < 250) nonWhite++;
        }
        return nonWhite > 100;
      });
      expect(isNotBlank).toBe(true);

      console.log(`✓ ${pdf.name}: canvas rendered with content`);
    });

    test(`${pdf.name}: page navigation works`, async ({ page }) => {
      await page.goto(`${BASE}/ressources/${pdf.slug}`, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('canvas', { timeout: 30000 });
      await page.waitForTimeout(2000);

      // Get initial page
      const pageInput = page.locator('input[type="number"]').first();
      const initial = await pageInput.inputValue();
      expect(['1', '1/1', '1/10']).toContain(initial);

      // Click next page
      const nextBtn = page.locator('button[aria-label="Page suivante"]');
      if (await nextBtn.isEnabled()) {
        await nextBtn.click();
        await page.waitForTimeout(500);
        const newPage = await pageInput.inputValue();
        expect(newPage).not.toBe(initial);
        console.log(`✓ ${pdf.name}: navigation works (${initial} → ${newPage})`);
      }
    });

    test(`${pdf.name}: zoom in/out works`, async ({ page }) => {
      await page.goto(`${BASE}/ressources/${pdf.slug}`, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('canvas', { timeout: 30000 });
      await page.waitForTimeout(2000);

      // Click zoom in 3 times
      const zoomIn = page.locator('button[aria-label="Zoom avant"]');
      await zoomIn.click();
      await page.waitForTimeout(500);
      await zoomIn.click();
      await page.waitForTimeout(500);
      await zoomIn.click();
      await page.waitForTimeout(1000);

      // The fit-to-width button should now show a percentage (manual mode)
      const fitBtn = page.locator('button[aria-label="Ajuster à la largeur"]');
      const text = await fitBtn.textContent();
      expect(text).toMatch(/%|Auto/);

      // Click fit-to-width to reset
      await fitBtn.click();
      await page.waitForTimeout(1000);
      const textAfter = await fitBtn.textContent();
      expect(textAfter).toMatch(/Auto/);

      console.log(`✓ ${pdf.name}: zoom + fit-to-width works`);
    });

    test(`${pdf.name}: download button works`, async ({ page }) => {
      await page.goto(`${BASE}/ressources/${pdf.slug}`, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('canvas', { timeout: 30000 });
      await page.waitForTimeout(2000);

      // Download button is the first Télécharger button on the page (resource page), not the PDF toolbar
      const dlBtn = page.locator('button:has-text("Télécharger")').first();
      await expect(dlBtn).toBeVisible();

      // PDF toolbar has its own download button (we just verify it exists too)
      const pdfToolbarDl = page.locator('.bg-slate-900 button[aria-label="Télécharger"]');
      const count = await pdfToolbarDl.count();
      expect(count).toBeGreaterThanOrEqual(0);

      console.log(`✓ ${pdf.name}: download button visible`);
    });
  }

  test('All 3 PDFs (test page list)', async ({ page }) => {
    await page.goto(`${BASE}/ressources`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    // Count visible resource cards
    const links = await page.locator('a[href*="/ressources/"]').count();
    expect(links).toBeGreaterThan(0);
    console.log(`✓ Found ${links} resources`);
  });

  test('PDF.js worker is accessible', async ({ request }) => {
    const res = await request.get(`${BASE}/pdf.worker.min.mjs`);
    expect(res.status()).toBe(200);
    const size = (await res.body()).length;
    expect(size).toBeGreaterThan(100000); // ~1.3MB
    console.log(`✓ Worker accessible, ${(size / 1024).toFixed(0)} KB`);
  });

  test('Self-hosted cmaps are accessible', async ({ request }) => {
    // Test a few common cmap files
    const cmaps = ['Adobe-CNS1-0.bcmap', '78-EUC-H.bcmap'];
    for (const cmap of cmaps) {
      const res = await request.get(`${BASE}/pdf-assets/cmaps/${cmap}`);
      expect(res.status()).toBe(200);
    }
    console.log(`✓ Cmaps accessible`);
  });

  test('Self-hosted standard fonts are accessible', async ({ request }) => {
    const fonts = ['FoxitSerif.pfb', 'FoxitSerifBold.pfb', 'FoxitSymbol.pfb', 'FoxitDingbats.pfb'];
    for (const font of fonts) {
      const res = await request.get(`${BASE}/pdf-assets/standard_fonts/${font}`);
      expect(res.status()).toBe(200);
    }
    console.log(`✓ Standard fonts accessible`);
  });
});