import { test, expect } from '@playwright/test';

const BASE = process.env.BASE_URL || 'http://localhost:3000';

test.describe('Settings page', () => {
  test('Page loads for student', async ({ page }) => {
    await page.goto(`${BASE}/connexion`);
    await page.fill('input[type="email"]', 'yassine@example.com');
    await page.fill('input[type="password"]', 'demo1234');
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/mon-compte/, { timeout: 15000 });

    await page.goto(`${BASE}/mon-compte/parametres`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);

    // Should see page title
    await expect(page.locator('h1', { hasText: 'Paramètres' })).toBeVisible();

    // Should see sidebar
    const sidebarLinks = ['Profil', 'Sécurité', 'Notifications', 'Préférences', 'Compte'];
    for (const link of sidebarLinks) {
      await expect(page.locator('button', { hasText: link }).first()).toBeVisible();
    }
    console.log('✓ Student sees default sections');
  });

  test('Page loads for teacher with extra Enseignement section', async ({ page }) => {
    await page.goto(`${BASE}/connexion`);
    await page.fill('input[type="email"]', 'ahmed.benali@examanet.com');
    await page.fill('input[type="password"]', 'demo1234');
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/(enseignant|mon-compte)/, { timeout: 15000 });

    await page.goto(`${BASE}/mon-compte/parametres`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);

    // Should see Enseignement section
    await expect(page.locator('button', { hasText: 'Enseignement' })).toBeVisible();
    console.log('✓ Teacher sees Enseignement section');
  });

  test('Page loads for admin with Administration section', async ({ page }) => {
    await page.goto(`${BASE}/connexion`);
    await page.fill('input[type="email"]', 'boutiti.mehdi@gmail.com');
    await page.fill('input[type="password"]', 'demo1234');
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/(admin|mon-compte|enseignant)/, { timeout: 15000 });

    await page.goto(`${BASE}/mon-compte/parametres`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);

    // Should see Administration section
    await expect(page.locator('button', { hasText: 'Administration' })).toBeVisible();
    console.log('✓ Admin sees Administration section');
  });

  test('Profile section shows form fields', async ({ page }) => {
    await page.goto(`${BASE}/connexion`);
    await page.fill('input[type="email"]', 'yassine@example.com');
    await page.fill('input[type="password"]', 'demo1234');
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/mon-compte/, { timeout: 15000 });

    await page.goto(`${BASE}/mon-compte/parametres`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);

    // Should be on Profile by default
    const firstNameInput = page.locator('input[type="text"]').first();
    await expect(firstNameInput).toBeVisible();

    // Email field should be present
    const phoneInput = page.locator('input[type="tel"]');
    await expect(phoneInput).toBeVisible();
    console.log('✓ Profile form fields visible');
  });

  test('Can update phone number', async ({ playwright }) => {
    const ctx = await playwright.request.newContext({ baseURL: BASE });
    try {
      await ctx.post(`${BASE}/api/auth/login`, {
        data: { email: 'yassine@example.com', password: 'demo1234' }
      });

      const newPhone = '+216 99 ' + Math.floor(Math.random() * 1000000);
      const res = await ctx.patch(`${BASE}/api/user/account`, {
        data: { phone: newPhone }
      });
      expect(res.ok()).toBeTruthy();

      const get = await ctx.get(`${BASE}/api/user/account`);
      const account = await get.json();
      expect(account.account.phone).toBe(newPhone);
      console.log('✓ Phone updated via API');
    } finally {
      await ctx.dispose();
    }
  });

  test('Change password with wrong current password fails', async ({ playwright }) => {
    const ctx = await playwright.request.newContext({ baseURL: BASE });
    try {
      await ctx.post(`${BASE}/api/auth/login`, {
        data: { email: 'yassine@example.com', password: 'demo1234' }
      });

      const res = await ctx.post(`${BASE}/api/user/change-password`, {
        data: { currentPassword: 'WRONG_PASSWORD', newPassword: 'NewPassword123!' }
      });
      expect(res.status()).toBe(400);
      const data = await res.json();
      expect(data.error).toMatch(/incorrect/i);
      console.log('✓ Wrong current password rejected');
    } finally {
      await ctx.dispose();
    }
  });

  test('Change password requires min 8 chars', async ({ playwright }) => {
    const ctx = await playwright.request.newContext({ baseURL: BASE });
    try {
      await ctx.post(`${BASE}/api/auth/login`, {
        data: { email: 'yassine@example.com', password: 'demo1234' }
      });

      const res = await ctx.post(`${BASE}/api/user/change-password`, {
        data: { currentPassword: 'demo1234', newPassword: 'short' }
      });
      expect(res.status()).toBe(400);
      const data = await res.json();
      expect(data.error).toMatch(/8 caractères/);
      console.log('✓ Short password rejected');
    } finally {
      await ctx.dispose();
    }
  });

  test('Notifications toggles work', async ({ playwright }) => {
    const ctx = await playwright.request.newContext({ baseURL: BASE });
    try {
      await ctx.post(`${BASE}/api/auth/login`, {
        data: { email: 'yassine@example.com', password: 'demo1234' }
      });

      // Toggle off
      const res1 = await ctx.patch(`${BASE}/api/user/account`, {
        data: { notifyEmail: false }
      });
      expect(res1.ok()).toBeTruthy();

      // Toggle on
      const res2 = await ctx.patch(`${BASE}/api/user/account`, {
        data: { notifyEmail: true }
      });
      expect(res2.ok()).toBeTruthy();
      console.log('✓ Notification toggles work');
    } finally {
      await ctx.dispose();
    }
  });

  test('Language preference can be changed', async ({ playwright }) => {
    const ctx = await playwright.request.newContext({ baseURL: BASE });
    try {
      await ctx.post(`${BASE}/api/auth/login`, {
        data: { email: 'yassine@example.com', password: 'demo1234' }
      });

      const res = await ctx.patch(`${BASE}/api/user/account`, {
        data: { preferredLang: 'ar' }
      });
      expect(res.ok()).toBeTruthy();

      const get = await ctx.get(`${BASE}/api/user/account`);
      const account = await get.json();
      expect(account.account.preferredLang).toBe('ar');

      // Reset to fr
      await ctx.patch(`${BASE}/api/user/account`, {
        data: { preferredLang: 'fr' }
      });
      console.log('✓ Language preference updated');
    } finally {
      await ctx.dispose();
    }
  });

  test('Teacher can update teaching subjects', async ({ playwright }) => {
    const ctx = await playwright.request.newContext({ baseURL: BASE });
    try {
      await ctx.post(`${BASE}/api/auth/login`, {
        data: { email: 'ahmed.benali@examanet.com', password: 'demo1234' }
      });

      const res = await ctx.patch(`${BASE}/api/user/account`, {
        data: { teachingSubjects: ['mathematiques', 'physique'] }
      });
      expect(res.ok()).toBeTruthy();

      const get = await ctx.get(`${BASE}/api/user/account`);
      const account = await get.json();
      const subjects = JSON.parse(account.account.teachingSubjects);
      expect(subjects).toContain('mathematiques');
      expect(subjects).toContain('physique');
      console.log('✓ Teaching subjects updated');
    } finally {
      await ctx.dispose();
    }
  });

  test('Unauthenticated cannot access settings API', async ({ playwright }) => {
    const ctx = await playwright.request.newContext({ baseURL: BASE });
    try {
      const res = await ctx.get(`${BASE}/api/user/account`);
      expect(res.status()).toBe(401);
      console.log('✓ Settings API protected');
    } finally {
      await ctx.dispose();
    }
  });
});