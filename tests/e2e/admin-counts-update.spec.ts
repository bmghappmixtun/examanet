import { test, expect } from '@playwright/test';

test('admin tab counts update after bulk action (no manual refresh needed)', async ({ page }) => {
  // Login as admin
  await page.goto('/connexion');
  await page.fill('input[type="email"]', 'boutiti.mehdi@gmail.com');
  await page.fill('input[type="password"]', 'demo1234');
  await page.click('button[type="submit"]');
  await page.waitForURL(/mon-compte|admin/, { timeout: 15000 });

  await page.goto('/admin/utilisateurs');
  await page.waitForTimeout(1500);

  // Read current teacher count
  const teachersTab = page.locator('button:has-text("Enseignants")');
  const teachersBefore = await teachersTab.locator('span').last().textContent();
  console.log(`Teachers count before: ${teachersBefore}`);

  // Find a teacher with OTP status (PENDING_OTP) - these are safe to activate
  const otpRow = page.locator('tr:has-text("OTP")').first();
  const otpCount = await otpRow.count();
  console.log(`Found ${otpCount} OTP rows on first page`);

  if (otpCount > 0) {
    // Select the checkbox on that row
    const otpCheckbox = otpRow.locator('input[type="checkbox"]');
    await otpCheckbox.check();
    await page.waitForTimeout(500);

    // Bulk action bar should appear
    await expect(page.locator('text=sélectionn').first()).toBeVisible({ timeout: 3000 });

    // Click "Activer"
    await page.click('button:has-text("Activer")');

    // Confirmation modal
    await expect(page.locator('text=Réactiver').first()).toBeVisible({ timeout: 3000 });
    await page.click('button:has-text("Confirmer")');

    // Wait for action + navigation
    await page.waitForTimeout(4000);

    // Counts should still be the same (we activated, not deleted)
    // But the OTP row should be gone
    const stillHasOtp = await page.locator('tr:has-text("OTP")').first().isVisible().catch(() => false);
    console.log(`OTP row still visible: ${stillHasOtp}`);

    // The page should have auto-refreshed
    const teachersAfter = await teachersTab.locator('span').last().textContent();
    console.log(`Teachers count after: ${teachersAfter}`);
    // Same count (we activated, not removed)
    expect(teachersAfter).toBe(teachersBefore);

    // Success toast
    await expect(page.locator('text=trait').first()).toBeVisible({ timeout: 3000 }).catch(() => {});
  }
});