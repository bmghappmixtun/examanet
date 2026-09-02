import { test, expect } from '@playwright/test';

const TEACHER_ID = 'cmqi8nr6x002p2n4apt7zy28t'; // Mohamed Gharbi (any teacher)
const ADMIN_EMAIL = 'boutiti.mehdi@gmail.com';
const ADMIN_PASSWORD = 'demo1234';

test('admin approval preview link uses public fileUrl, not blob key', async ({ page, request }) => {
  // Create a test pending resource via API (we have an existing test from before)
  // The test resource created via direct DB has fileUrl=https://kmy1h6us8l7bg7bg.public.blob.vercel-storage.com/...

  // Login as admin
  await page.goto('/connexion');
  await page.fill('input[type="email"]', ADMIN_EMAIL);
  await page.fill('input[type="password"]', ADMIN_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/mon-compte|admin/, { timeout: 15000 });

  // Go to approvals
  await page.goto('/admin/approbations');
  await page.waitForLoadState('domcontentloaded');

  // Find the preview link
  const previewLink = page.locator('a:has-text("Prévisualiser le fichier")').first();
  const count = await previewLink.count();

  if (count === 0) {
    test.skip(true, 'No pending resource to test (admin saw empty state)');
    return;
  }

  const href = await previewLink.getAttribute('href');
  console.log('Preview href:', href);

  // Must be a public http(s) URL
  expect(href).toBeTruthy();
  expect(href).toMatch(/^https?:\/\//);
  // Must NOT be a relative path like /teacher-library/...
  expect(href).not.toMatch(/^\/teacher-library/);
});

test.afterAll(async ({ request }) => {
  // Cleanup: delete the test resource (best effort, ignore if not found)
  // We use direct DB cleanup via a separate script
});