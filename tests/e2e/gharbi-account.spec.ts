import { test, expect } from '@playwright/test';

const BASE = process.env.BASE_URL || 'http://localhost:3000';

test.describe('Mr GHARBI RIDHA Teacher Account', () => {
  test('GHARBI RIDHA profile is publicly visible', async ({ page }) => {
    // Use the specific Ridha Gharbi ID we know about
    await page.goto(`${BASE}/professeurs`);
    await page.waitForLoadState('networkidle');

    // Find RIDHA Gharbi (not Mohamed Gharbi who is also in seed data)
    const ridhaLink = page.locator('a[href^="/professeurs/"]').filter({ hasText: /Ridha/i });
    const count = await ridhaLink.count();
    expect(count).toBeGreaterThan(0);
    console.log(`✓ Found ${count} Ridha links on /professeurs`);

    await ridhaLink.first().click();
    await page.waitForURL(/\/professeurs\/[a-z0-9]{20,}/);
    await page.waitForLoadState('networkidle');

    // Check profile elements (use case-insensitive matching)
    await expect(page.locator('h1')).toContainText(/Ridha.*Gharbi|Gharbi.*Ridha/i);
    // Profile should mention Mathématiques somewhere
    const pageText = await page.locator('main').textContent();
    expect(pageText).toContain('Mathématiques');
    expect(pageText).toMatch(/Coll[eè]ge/i);
    expect(pageText).toMatch(/75/);
    console.log('✓ GHARBI RIDHA profile shows correctly with 75 resources');
  });

  test('GHARBI RIDHA can login with provided credentials', async ({ page }) => {
    await page.goto(`${BASE}/connexion`, { waitUntil: 'domcontentloaded' });

    // Fill the form
    const emailInput = page.locator('input[name="email"], input[type="email"]').first();
    const pwdInput = page.locator('input[name="password"], input[type="password"]').first();
    await emailInput.fill('gharbi.ridha@examanet.com');
    await pwdInput.fill('GharbiRidha2026!');
    await page.locator('button[type="submit"]').first().click();

    // Should redirect to /enseignant (teacher dashboard)
    try {
      await page.waitForURL(/\/(enseignant|mon-compte)/, { timeout: 20000 });
      console.log('✓ GHARBI RIDHA login successful, URL:', page.url());
    } catch (e) {
      const body = await page.locator('body').textContent();
      console.log('Login failed. Body excerpt:', body?.slice(0, 500));
      throw e;
    }
  });

  test('GHARBI RIDHA has 75 resources on his profile', async ({ playwright }) => {
    const ctx = await playwright.request.newContext({ baseURL: BASE });
    try {
      // Login as GHARBI
      const loginRes = await ctx.post(`${BASE}/api/auth/login`, {
        data: { email: 'gharbi.ridha@examanet.com', password: 'GharbiRidha2026!' }
      });
      expect(loginRes.ok()).toBeTruthy();

      const meRes = await ctx.get(`${BASE}/api/auth/me`);
      const me = await meRes.json();
      expect(me.user.email).toBe('gharbi.ridha@examanet.com');
      console.log('✓ Logged in as GHARBI RIDHA:', me.user.id);

      // Fetch his profile
      const profileRes = await ctx.get(`${BASE}/professeurs/${me.user.id}`);
      expect(profileRes.ok()).toBeTruthy();
      const html = await profileRes.text();
      // The page should show 75 in the resources count
      expect(html).toMatch(/Ressources\s*\(\s*75\s*\)|>75</);
      console.log('✓ 75 resources shown on profile');
    } finally {
      await ctx.dispose();
    }
  });

  test('GHARBI RIDHA profile has expected metadata', async ({ playwright }) => {
    const ctx = await playwright.request.newContext({ baseURL: BASE });
    try {
      const loginRes = await ctx.post(`${BASE}/api/auth/login`, {
        data: { email: 'gharbi.ridha@examanet.com', password: 'GharbiRidha2026!' }
      });
      expect(loginRes.ok()).toBeTruthy();

      const meRes = await ctx.get(`${BASE}/api/auth/me`);
      const me = await meRes.json();

      // Fetch profile via API
      const profileRes = await ctx.get(`${BASE}/api/teacher/profile`);
      expect(profileRes.ok()).toBeTruthy();
      const profile = await profileRes.json();

      expect(profile.firstName).toBe('Ridha');
      expect(profile.lastName).toBe('Gharbi');
      expect(profile.schoolName).toBe('Collège');
      expect(profile.governorate).toBe('Tunis');
      expect(profile.diploma).toBe('Master');
      expect(profile.bio).toBeTruthy();
      // Bio may have been updated by previous test, just verify it exists

      console.log('✓ Profile metadata correct:');
      console.log('  -', profile.firstName, profile.lastName);
      console.log('  -', profile.schoolName, '·', profile.governorate, '·', profile.diploma);
    } finally {
      await ctx.dispose();
    }
  });

  test('GHARBI RIDHA can update his own profile', async ({ playwright }) => {
    const ctx = await playwright.request.newContext({ baseURL: BASE });
    try {
      await ctx.post(`${BASE}/api/auth/login`, {
        data: { email: 'gharbi.ridha@examanet.com', password: 'GharbiRidha2026!' }
      });

      // Update bio
      const updateRes = await ctx.patch(`${BASE}/api/teacher/profile`, {
        data: { bio: 'Updated bio by E2E test ' + Date.now() }
      });
      expect(updateRes.ok()).toBeTruthy();

      // Verify
      const profileRes = await ctx.get(`${BASE}/api/teacher/profile`);
      const profile = await profileRes.json();
      expect(profile.bio).toContain('Updated bio by E2E test');
      console.log('✓ GHARBI RIDHA can update own profile');
    } finally {
      await ctx.dispose();
    }
  });

  test('Non-admin cannot update other users', async ({ playwright }) => {
    const ctx = await playwright.request.newContext({ baseURL: BASE });
    try {
      // Login as student
      await ctx.post(`${BASE}/api/auth/login`, {
        data: { email: 'yassine@example.com', password: 'demo1234' }
      });

      // Try to update GHARBI
      const updateRes = await ctx.patch(`${BASE}/api/admin/users/some-id`, {
        data: { firstName: 'Hacker' }
      });
      expect(updateRes.status()).toBe(403);
      console.log('✓ Student cannot update users via admin endpoint');
    } finally {
      await ctx.dispose();
    }
  });

  test('Transfer resources endpoint works for admin', async ({ playwright }) => {
    const adminCtx = await playwright.request.newContext({ baseURL: BASE });
    const targetCtx = await playwright.request.newContext({ baseURL: BASE });
    try {
      // Login as admin
      const adminLogin = await adminCtx.post(`${BASE}/api/auth/login`, {
        data: { email: 'boutiti.mehdi@gmail.com', password: 'demo1234' }
      });
      expect(adminLogin.ok()).toBeTruthy();

      // Login as GHARBI
      const gharbiLogin = await targetCtx.post(`${BASE}/api/auth/login`, {
        data: { email: 'gharbi.ridha@examanet.com', password: 'GharbiRidha2026!' }
      });
      expect(gharbiLogin.ok()).toBeTruthy();
      const gharbiMe = await targetCtx.get(`${BASE}/api/auth/me`);
      const gharbi = await gharbiMe.json();
      const gharbiId = gharbi.user.id;

      // Get current resource count for GHARBI
      const beforeRes = await adminCtx.get(`${BASE}/api/admin/users/${gharbiId}`);
      const before = await beforeRes.json();
      console.log('GHARBI resources before:', before._count?.uploadedFiles || 'unknown');

      // Try transferring from non-existent user
      const transferRes = await adminCtx.post(`${BASE}/api/admin/users/transfer-resources`, {
        data: {
          fromUserEmail: 'nonexistent@test.com',
          toUserId: gharbiId
        }
      });
      expect(transferRes.status()).toBe(404);
      console.log('✓ Transfer fails properly for non-existent user');
    } finally {
      await adminCtx.dispose();
      await targetCtx.dispose();
    }
  });
});