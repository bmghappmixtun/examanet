import { test, expect } from '@playwright/test';

const BASE_URL = 'https://examanet.com';
const TEACHER_EMAIL = 'ahmed.benali@examanet.com';
const TEACHER_PASSWORD = 'demo1234';

test('Teacher can edit a published resource (creates pending edit)', async ({ page }) => {
  // 1. Login as teacher
  await page.goto(`${BASE_URL}/connexion`);
  await page.fill('input[type="email"]', TEACHER_EMAIL);
  await page.fill('input[type="password"]', TEACHER_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(mon-compte|enseignant)/, { timeout: 10000 });

  // 2. Go to resources page
  await page.goto(`${BASE_URL}/enseignant/ressources`);
  await page.waitForLoadState('domcontentloaded');
  await page.screenshot({ path: 'tests/e2e/screenshots/teacher-resources.png', fullPage: true });

  // 3. Find an edit link (skip those with pointer-events-none = already pending)
  const allEditLinks = await page.locator('a[href*="/modifier"]').all();
  let editLink: any = null;
  for (const link of allEditLinks) {
    const cls = await link.getAttribute('class') || '';
    if (!cls.includes('pointer-events-none')) {
      editLink = link;
      break;
    }
  }
  if (!editLink) {
    console.log('All resources have pending edits - test skipped');
    return;
  }

  await editLink.click();
  await page.waitForURL(/\/modifier/, { timeout: 10000 });
  await page.screenshot({ path: 'tests/e2e/screenshots/teacher-edit-form.png', fullPage: true });

  // 4. Modify the title
  const titleInput = page.locator('input[type="text"]').first();
  const newTitle = 'Test E2E ' + Date.now();
  await titleInput.fill(newTitle);

  // 5. Submit
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/enseignant\/ressources/, { timeout: 15000 });

  // 6. Verify pending badge appears
  const pendingBadge = await page.locator('text=/Modif.*en attente/i').count();
  console.log('Pending edit badge visible:', pendingBadge > 0);
  expect(pendingBadge).toBeGreaterThan(0);

  await page.screenshot({ path: 'tests/e2e/screenshots/teacher-after-edit.png', fullPage: true });
});

test('Admin can see pending edits in the admin panel', async ({ page }) => {
  // Login as admin
  await page.goto(`${BASE_URL}/connexion`);
  await page.fill('input[type="email"]', 'boutiti.mehdi@gmail.com');
  await page.fill('input[type="password"]', 'demo1234');
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(mon-compte|admin)/, { timeout: 10000 });

  // Go to editions page
  await page.goto(`${BASE_URL}/admin/ressources/editions`);
  await page.waitForLoadState('domcontentloaded');
  await page.screenshot({ path: 'tests/e2e/screenshots/admin-editions.png', fullPage: true });

  const heading = await page.locator('h1').first().textContent();
  console.log('Heading:', heading);
  expect(heading).toContain('Modifications');
});
