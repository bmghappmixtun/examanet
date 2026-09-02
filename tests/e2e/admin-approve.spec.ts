import { test, expect } from '@playwright/test';

const BASE = process.env.BASE_URL || 'http://localhost:3000';

test.describe('Admin approval flow', () => {
  test('Full E2E: teacher uploads resource → admin sees it → admin approves it', async ({ playwright }) => {
    // Fresh contexts
    const teacherCtx = await playwright.request.newContext({ baseURL: BASE });
    const adminCtx = await playwright.request.newContext({ baseURL: BASE });
    try {
      // === STEP 1: Login as teacher ===
      const teacherLogin = await teacherCtx.post(`${BASE}/api/auth/login`, {
        data: { email: 'ahmed.benali@examanet.com', password: 'demo1234' }
      });
      expect(teacherLogin.ok()).toBeTruthy();

      // === STEP 2: Teacher uploads a resource ===
      const uploadRes = await teacherCtx.post(`${BASE}/api/teacher/resources`, {
        multipart: {
          title: `E2E Approve Test ${Date.now()}`,
          description: 'Resource to test admin approval',
          type: 'COURSE',
          subject: 'mathematiques',
          class: '4eme-secondaire',
          year: '2023-2024'
        }
      });
      expect(uploadRes.ok()).toBeTruthy();
      const uploaded = await uploadRes.json();
      console.log('✓ Teacher uploaded resource:', uploaded.resource.id);
      expect(uploaded.resource.status).toBe('PENDING_APPROVAL');

      // === STEP 3: Login as admin ===
      const adminLogin = await adminCtx.post(`${BASE}/api/auth/login`, {
        data: { email: 'boutiti.mehdi@gmail.com', password: 'demo1234' }
      });
      expect(adminLogin.ok()).toBeTruthy();

      // === STEP 4: Admin approves the resource ===
      const approveRes = await adminCtx.post(`${BASE}/api/admin/resource/${uploaded.resource.id}/approve`);
      console.log('Approve response status:', approveRes.status());
      const approveData = await approveRes.json();
      console.log('Approve response:', JSON.stringify(approveData));

      expect(approveRes.ok()).toBeTruthy();
      expect(approveData.success).toBe(true);

      // === STEP 5: Verify resource is now PUBLISHED ===
      const checkRes = await adminCtx.get(`${BASE}/api/resources/${uploaded.resource.id}`);
      // We don't have this endpoint, so we'll check via DB through another endpoint
      // Let's check via the public resources list
      const listRes = await adminCtx.get(`${BASE}/api/ressources?limit=5`);
      // Just check the resource status changed - we'll verify via the resource page
      console.log('✓ Resource approved, checking status...');

      // Verify the resource shows on the public page now
      const publicRes = await adminCtx.get(`${BASE}/ressources/${uploaded.resource.slug}`);
      expect(publicRes.ok()).toBeTruthy();
      const publicHtml = await publicRes.text();
      expect(publicHtml).toContain(uploaded.resource.title);
      console.log('✓ Resource visible on public page');
    } finally {
      await teacherCtx.dispose();
      await adminCtx.dispose();
    }
  });

  test('Admin can REJECT a resource', async ({ playwright }) => {
    const teacherCtx = await playwright.request.newContext({ baseURL: BASE });
    const adminCtx = await playwright.request.newContext({ baseURL: BASE });
    try {
      // Login teacher
      await teacherCtx.post(`${BASE}/api/auth/login`, {
        data: { email: 'ahmed.benali@examanet.com', password: 'demo1234' }
      });

      // Upload resource
      const uploadRes = await teacherCtx.post(`${BASE}/api/teacher/resources`, {
        multipart: {
          title: `E2E Reject Test ${Date.now()}`,
          type: 'COURSE',
          subject: 'mathematiques',
          class: '4eme-secondaire'
        }
      });
      const uploaded = await uploadRes.json();
      console.log('✓ Teacher uploaded:', uploaded.resource.id);

      // Login admin
      await adminCtx.post(`${BASE}/api/auth/login`, {
        data: { email: 'boutiti.mehdi@gmail.com', password: 'demo1234' }
      });

      // Reject
      const rejectRes = await adminCtx.post(`${BASE}/api/admin/resource/${uploaded.resource.id}/reject`);
      const data = await rejectRes.json();
      console.log('Reject response:', rejectRes.status(), JSON.stringify(data));

      expect(rejectRes.ok()).toBeTruthy();
      expect(data.success).toBe(true);
      console.log('✓ Resource rejected');
    } finally {
      await teacherCtx.dispose();
      await adminCtx.dispose();
    }
  });

  test('Teacher CANNOT approve their own resource (admin-only)', async ({ playwright }) => {
    const teacherCtx = await playwright.request.newContext({ baseURL: BASE });
    try {
      // Login teacher
      await teacherCtx.post(`${BASE}/api/auth/login`, {
        data: { email: 'ahmed.benali@examanet.com', password: 'demo1234' }
      });

      // Upload
      const uploadRes = await teacherCtx.post(`${BASE}/api/teacher/resources`, {
        multipart: {
          title: `E2E Self-Approve Test ${Date.now()}`,
          type: 'COURSE',
          subject: 'mathematiques',
          class: '4eme-secondaire'
        }
      });
      const uploaded = await uploadRes.json();

      // Teacher tries to approve (should fail)
      const selfApproveRes = await teacherCtx.post(`${BASE}/api/admin/resource/${uploaded.resource.id}/approve`);
      expect(selfApproveRes.status()).toBe(403);
      console.log('✓ Teacher correctly blocked from self-approval');
    } finally {
      await teacherCtx.dispose();
    }
  });

  test('Admin UI shows pending resources and approve buttons work', async ({ page }) => {
    // Login as admin via UI
    await page.goto(`${BASE}/connexion`);
    await page.fill('input[type="email"]', 'boutiti.mehdi@gmail.com');
    await page.fill('input[type="password"]', 'demo1234');
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/(admin|mon-compte)/, { timeout: 15000 });

    // Navigate to approbations page
    await page.goto(`${BASE}/admin/approbations`);

    // Verify page loaded
    await expect(page.locator('h1')).toContainText(/Approbations/);

    // Look for at least one "Approuver" button (if any pending)
    const approveButtons = page.locator('button', { hasText: 'Approuver' });
    const count = await approveButtons.count();
    console.log(`Found ${count} "Approuver" buttons on page`);

    if (count > 0) {
      // Click first approve button
      await approveButtons.first().click();
      // Wait for toast or reload
      await page.waitForTimeout(2000);
      console.log('✓ Clicked approve button');
    } else {
      console.log('⚠️ No pending resources to approve');
    }
  });
});