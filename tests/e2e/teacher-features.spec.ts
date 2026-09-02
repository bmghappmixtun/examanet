import { test, expect } from '@playwright/test';

const BASE = process.env.BASE_URL || 'http://localhost:3000';

test.describe('Feature: Edit Profile', () => {
  test('Teacher can view and edit profile', async ({ playwright }) => {
    const ctx = await playwright.request.newContext({ baseURL: BASE });
    try {
      const login = await ctx.post(`${BASE}/api/auth/login`, {
        data: { email: 'ahmed.benali@examanet.com', password: 'demo1234' }
      });
      expect(login.ok()).toBeTruthy();

      // GET profile
      const get = await ctx.get(`${BASE}/api/teacher/profile`);
      expect(get.ok()).toBeTruthy();
      const profile = await get.json();
      expect(profile.firstName).toBeTruthy();
      console.log('✓ GET profile works, teacher:', profile.firstName, profile.lastName);

      // PATCH profile
      const patch = await ctx.patch(`${BASE}/api/teacher/profile`, {
        data: { bio: 'Test bio updated by E2E ' + Date.now() }
      });
      expect(patch.ok()).toBeTruthy();
      const updated = await patch.json();
      expect(updated.profile.bio).toContain('Test bio updated');
      console.log('✓ PATCH profile works');

      // Verify teachingSubjects/Levels array
      const patch2 = await ctx.patch(`${BASE}/api/teacher/profile`, {
        data: {
          teachingSubjects: ['Mathématiques', 'Physique'],
          teachingLevels: ['Lycée', 'Bac']
        }
      });
      expect(patch2.ok()).toBeTruthy();
      console.log('✓ Teaching subjects/levels update works');
    } finally {
      await ctx.dispose();
    }
  });

  test('Edit profile page loads in UI', async ({ page }) => {
    await page.goto(`${BASE}/connexion`);
    await page.fill('input[type="email"]', 'ahmed.benali@examanet.com');
    await page.fill('input[type="password"]', 'demo1234');
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/(enseignant|mon-compte)/, { timeout: 15000 });

    await page.goto(`${BASE}/enseignant/profil`);
    await page.waitForLoadState('networkidle');

    await expect(page.locator('h1', { hasText: 'profil enseignant' })).toBeVisible();
    await expect(page.locator('textarea')).toBeVisible();
    console.log('✓ Edit profile UI loads');
  });

  test('Non-teacher cannot access edit profile', async ({ playwright }) => {
    const ctx = await playwright.request.newContext({ baseURL: BASE });
    try {
      await ctx.post(`${BASE}/api/auth/login`, {
        data: { email: 'yassine@example.com', password: 'demo1234' }
      });
      const res = await ctx.get(`${BASE}/api/teacher/profile`);
      expect(res.status()).toBe(403);
      console.log('✓ Student cannot access teacher profile API');
    } finally {
      await ctx.dispose();
    }
  });
});

test.describe('Feature: Follow system', () => {
  test('Student can follow a teacher', async ({ playwright }) => {
    const ctx = await playwright.request.newContext({ baseURL: BASE });
    try {
      // Login as student
      const login = await ctx.post(`${BASE}/api/auth/login`, {
        data: { email: 'yassine@example.com', password: 'demo1234' }
      });
      expect(login.ok()).toBeTruthy();

      // Get a teacher ID
      const profsRes = await ctx.get(`${BASE}/professeurs`);
      const html = await profsRes.text();
      const match = html.match(/\/professeurs\/([a-z0-9]{20,})/);
      const teacherId = match![1];

      // Follow
      const followRes = await ctx.post(`${BASE}/api/follows`, {
        data: { teacherId }
      });
      expect(followRes.ok()).toBeTruthy();
      const followData = await followRes.json();
      expect(typeof followData.following).toBe('boolean');
      expect(typeof followData.followersCount).toBe('number');
      console.log('✓ Follow toggles:', followData.following ? 'ON' : 'OFF', '| Count:', followData.followersCount);

      // Verify GET shows correct state
      const getRes = await ctx.get(`${BASE}/api/follows?teacherId=${teacherId}`);
      expect(getRes.ok()).toBeTruthy();
      const getData = await getRes.json();
      expect(getData.following).toBe(followData.following);
      console.log('✓ GET status matches');
    } finally {
      await ctx.dispose();
    }
  });

  test('Cannot follow self', async ({ playwright }) => {
    const ctx = await playwright.request.newContext({ baseURL: BASE });
    try {
      await ctx.post(`${BASE}/api/auth/login`, {
        data: { email: 'yassine@example.com', password: 'demo1234' }
      });
      const me = await ctx.get(`${BASE}/api/auth/me`);
      const user = await me.json();
      const res = await ctx.post(`${BASE}/api/follows`, {
        data: { teacherId: user.user.id }
      });
      expect(res.status()).toBe(400);
      console.log('✓ Cannot follow self');
    } finally {
      await ctx.dispose();
    }
  });

  test('Cannot follow non-teacher', async ({ playwright }) => {
    const ctx = await playwright.request.newContext({ baseURL: BASE });
    try {
      await ctx.post(`${BASE}/api/auth/login`, {
        data: { email: 'yassine@example.com', password: 'demo1234' }
      });
      // Try to follow a student
      const res = await ctx.post(`${BASE}/api/follows`, {
        data: { teacherId: 'yassine-user-id-test-1234567890ab' }
      });
      expect(res.status()).toBe(404);
      console.log('✓ Cannot follow non-teacher');
    } finally {
      await ctx.dispose();
    }
  });

  test('Anonymous user can see follow count but cannot follow', async ({ playwright }) => {
    const ctx = await playwright.request.newContext({ baseURL: BASE });
    try {
      const profsRes = await ctx.get(`${BASE}/professeurs`);
      const html = await profsRes.text();
      const match = html.match(/\/professeurs\/([a-z0-9]{20,})/);
      const teacherId = match![1];

      const getRes = await ctx.get(`${BASE}/api/follows?teacherId=${teacherId}`);
      expect(getRes.ok()).toBeTruthy();
      const data = await getRes.json();
      expect(data.following).toBe(false);
      expect(typeof data.followersCount).toBe('number');
      console.log('✓ Anonymous can see follow count:', data.followersCount);

      // Try to follow without auth
      const followRes = await ctx.post(`${BASE}/api/follows`, {
        data: { teacherId }
      });
      expect(followRes.status()).toBe(401);
      console.log('✓ Anonymous cannot follow');
    } finally {
      await ctx.dispose();
    }
  });
});

test.describe('Feature: Messaging', () => {
  test('Student can start conversation with teacher', async ({ playwright }) => {
    const studentCtx = await playwright.request.newContext({ baseURL: BASE });
    const teacherCtx = await playwright.request.newContext({ baseURL: BASE });
    try {
      // Login teacher first to get their ID
      const teacherLogin = await teacherCtx.post(`${BASE}/api/auth/login`, {
        data: { email: 'ahmed.benali@examanet.com', password: 'demo1234' }
      });
      expect(teacherLogin.ok()).toBeTruthy();
      const teacherMe = await teacherCtx.get(`${BASE}/api/auth/me`);
      const teacher = await teacherMe.json();
      const teacherId = teacher.user.id;
      console.log('  Teacher ID:', teacherId);

      // Login student
      await studentCtx.post(`${BASE}/api/auth/login`, {
        data: { email: 'yassine@example.com', password: 'demo1234' }
      });

      // Start conversation with this specific teacher
      const convRes = await studentCtx.post(`${BASE}/api/conversations`, {
        data: { teacherId }
      });
      expect(convRes.ok()).toBeTruthy();
      const conv = await convRes.json();
      expect(conv.conversation.id).toBeTruthy();
      console.log('✓ Conversation created:', conv.conversation.id);

      // Send message
      const msgRes = await studentCtx.post(`${BASE}/api/conversations/${conv.conversation.id}/messages`, {
        data: { content: 'Bonjour professeur ! Test E2E ' + Date.now() }
      });
      expect(msgRes.ok()).toBeTruthy();
      console.log('✓ Message sent');

      // Teacher reads it
      const getMsgsRes = await teacherCtx.get(`${BASE}/api/conversations/${conv.conversation.id}/messages`);
      expect(getMsgsRes.ok()).toBeTruthy();
      const msgs = await getMsgsRes.json();
      expect(msgs.messages.length).toBeGreaterThan(0);
      expect(msgs.messages[0].content).toContain('Bonjour');
      console.log('✓ Teacher can read message');
    } finally {
      await studentCtx.dispose();
      await teacherCtx.dispose();
    }
  });

  test('Teacher can reply to student message', async ({ playwright }) => {
    const studentCtx = await playwright.request.newContext({ baseURL: BASE });
    const teacherCtx = await playwright.request.newContext({ baseURL: BASE });
    try {
      // Login teacher first to get ID
      await teacherCtx.post(`${BASE}/api/auth/login`, {
        data: { email: 'ahmed.benali@examanet.com', password: 'demo1234' }
      });
      const teacherMe = await teacherCtx.get(`${BASE}/api/auth/me`);
      const teacher = await teacherMe.json();
      const teacherId = teacher.user.id;

      // Student starts conversation
      await studentCtx.post(`${BASE}/api/auth/login`, {
        data: { email: 'yassine@example.com', password: 'demo1234' }
      });
      const convRes = await studentCtx.post(`${BASE}/api/conversations`, {
        data: { teacherId }
      });
      const conv = await convRes.json();

      // Teacher replies
      const replyRes = await teacherCtx.post(`${BASE}/api/conversations/${conv.conversation.id}/messages`, {
        data: { content: 'Bien reçu, merci pour votre message !' }
      });
      expect(replyRes.ok()).toBeTruthy();
      console.log('✓ Teacher reply sent');

      // Student lists conversations
      const listRes = await studentCtx.get(`${BASE}/api/conversations`);
      const data = await listRes.json();
      expect(data.conversations.length).toBeGreaterThan(0);
      const found = data.conversations.find((c: any) => c.id === conv.conversation.id);
      expect(found).toBeTruthy();
      console.log('✓ Student sees conversation in inbox');
    } finally {
      await studentCtx.dispose();
      await teacherCtx.dispose();
    }
  });

  test('Cannot send empty message', async ({ playwright }) => {
    const ctx = await playwright.request.newContext({ baseURL: BASE });
    try {
      await ctx.post(`${BASE}/api/auth/login`, {
        data: { email: 'yassine@example.com', password: 'demo1234' }
      });
      const profsRes = await ctx.get(`${BASE}/professeurs`);
      const html = await profsRes.text();
      const match = html.match(/\/professeurs\/([a-z0-9]{20,})/);
      const teacherId = match![1];
      const convRes = await ctx.post(`${BASE}/api/conversations`, {
        data: { teacherId }
      });
      const conv = await convRes.json();

      const res = await ctx.post(`${BASE}/api/conversations/${conv.conversation.id}/messages`, {
        data: { content: '   ' }
      });
      expect(res.status()).toBe(400);
      console.log('✓ Empty message rejected');
    } finally {
      await ctx.dispose();
    }
  });

  test('Messages inbox page loads', async ({ page }) => {
    await page.goto(`${BASE}/connexion`);
    await page.fill('input[type="email"]', 'yassine@example.com');
    await page.fill('input[type="password"]', 'demo1234');
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/(mon-compte|enseignant)/, { timeout: 15000 });

    await page.goto(`${BASE}/messages`);
    await page.waitForLoadState('networkidle');

    await expect(page.locator('h1')).toContainText(/Messages/);
    console.log('✓ Messages inbox loads');
  });
});

test.describe('Feature: Analytics', () => {
  test('Teacher analytics page loads', async ({ page }) => {
    await page.goto(`${BASE}/connexion`);
    await page.fill('input[type="email"]', 'ahmed.benali@examanet.com');
    await page.fill('input[type="password"]', 'demo1234');
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/(enseignant|mon-compte)/, { timeout: 15000 });

    await page.goto(`${BASE}/enseignant/analytics`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1500);

    // Check KPI cards (case insensitive)
    const hasKPI = await page.locator('text=/Ressources|Vues|Followers/i').count();
    expect(hasKPI).toBeGreaterThan(0);
    console.log('✓ Analytics page loads with KPIs');
  });

  test('Student cannot access analytics', async ({ page }) => {
    await page.goto(`${BASE}/connexion`);
    await page.fill('input[type="email"]', 'yassine@example.com');
    await page.fill('input[type="password"]', 'demo1234');
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/mon-compte/, { timeout: 15000 });

    await page.goto(`${BASE}/enseignant/analytics`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000);

    // Should be redirected (to /, /mon-compte, or /connexion)
    expect(page.url()).toMatch(/\/(mon-compte|connexion|$)/);
    console.log('✓ Student redirected away from analytics. URL:', page.url());
  });
});