import { test, expect } from '@playwright/test';

test('admin users page: tabs + bulk actions', async ({ page }) => {
  const responses: any[] = [];
  page.on('response', async (res) => {
    if (res.url().includes('/api/admin/users/bulk')) {
      try {
        const body = await res.json();
        responses.push({ status: res.status(), body });
      } catch {
        responses.push({ status: res.status(), body: 'non-json' });
      }
    }
  });

  // Login as admin
  await page.goto('/connexion');
  await page.fill('input[type="email"]', 'boutiti.mehdi@gmail.com');
  await page.fill('input[type="password"]', 'demo1234');
  await page.click('button[type="submit"]');
  await page.waitForURL(/mon-compte|admin/, { timeout: 15000 });

  // Go to users page
  await page.goto('/admin/utilisateurs');
  await page.waitForTimeout(1500);

  // Should show 3 tabs with counts
  await expect(page.locator('button:has-text("Enseignants")')).toBeVisible({ timeout: 5000 });
  await expect(page.locator('button:has-text("Élèves")')).toBeVisible();
  await expect(page.locator('button:has-text("Administrateurs")')).toBeVisible();

  // Default tab should be Teachers
  await expect(page.locator('h1:has-text("Gestion des utilisateurs")')).toBeVisible();

  // Take screenshot of teachers tab
  await page.screenshot({ path: 'tests/e2e/screenshots/admin-users-teachers.png', fullPage: true });

  // Click on Students tab
  await page.click('button:has-text("Élèves")');
  await page.waitForURL(/role=STUDENT/, { timeout: 5000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'tests/e2e/screenshots/admin-users-students.png', fullPage: true });

  // Go back to teachers
  await page.click('button:has-text("Enseignants")');
  await page.waitForURL(/role=TEACHER/, { timeout: 5000 });
  await page.waitForTimeout(1500);

  // Select first 2 users via checkboxes
  const checkboxes = page.locator('tbody input[type="checkbox"]:not([disabled])');
  const count = await checkboxes.count();
  console.log(`Found ${count} selectable checkboxes`);
  if (count >= 2) {
    await checkboxes.nth(0).check();
    await checkboxes.nth(1).check();
    await page.waitForTimeout(500);

    // Bulk action bar should appear
    await expect(page.locator('text=utilisateurs sélectionnés').first()).toBeVisible({ timeout: 3000 });
    await page.screenshot({ path: 'tests/e2e/screenshots/admin-users-bulk-selected.png', fullPage: true });

    // Click "Tout sélectionner" to select all
    await page.click('button:has-text("Tout sélectionner")');
    await page.waitForTimeout(500);
  }

  // Test search
  await page.fill('input[placeholder*="Rechercher"]', 'gmail');
  await page.click('button:has-text("Rechercher")');
  await page.waitForTimeout(1000);
});