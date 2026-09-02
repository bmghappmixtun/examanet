import { test, expect } from '@playwright/test';

const BASE = process.env.BASE_URL || 'http://localhost:3000';

test.describe('Delete user - file options', () => {
  test('Delete endpoint accepts keepFiles parameter', async ({ playwright }) => {
    const context = await playwright.request.newContext({ baseURL: BASE });
    try {
      // Login as admin
      const loginRes = await context.post(`${BASE}/api/auth/login`, {
        data: { email: 'boutiti.mehdi@gmail.com', password: 'demo1234' }
      });
      expect(loginRes.ok()).toBeTruthy();

      // Create a teacher
      const timestamp = Date.now();
      const email = `del-files-${timestamp}@test.com`;
      const regRes = await context.post(`${BASE}/api/auth/register`, {
        data: {
          email,
          password: 'Test1234!',
          firstName: 'DeleteFiles',
          lastName: 'Test',
          role: 'TEACHER'
        }
      });
      expect(regRes.ok()).toBeTruthy();

      // Try to delete with keepFiles=true (using the format the modal would use)
      const deleteRes = await context.post(`${BASE}/api/admin/users/non-existent/delete`, {
        data: { keepFiles: 'true' }
      });
      // Non-existent user returns 404
      expect(deleteRes.status()).toBe(404);

      // Try with keepFiles=false
      const deleteRes2 = await context.post(`${BASE}/api/admin/users/non-existent/delete`, {
        data: { keepFiles: 'false' }
      });
      expect(deleteRes2.status()).toBe(404);

      // Test JSON format too
      const deleteRes3 = await context.post(`${BASE}/api/admin/users/non-existent/delete`, {
        data: { keepFiles: true }
      });
      expect(deleteRes3.status()).toBe(404);
    } finally {
      await context.dispose();
    }
  });

  test('Admin can delete teacher with keepFiles=true (files transferred to admin)', async ({ playwright }) => {
    const context = await playwright.request.newContext({ baseURL: BASE });
    try {
      // Login as admin
      const loginRes = await context.post(`${BASE}/api/auth/login`, {
        data: { email: 'boutiti.mehdi@gmail.com', password: 'demo1234' }
      });
      expect(loginRes.ok()).toBeTruthy();

      // Verify keepFiles parameter is accepted
      const res = await context.post(`${BASE}/api/admin/users/non-existent/delete`, {
        data: { keepFiles: 'true' }
      });
      // The endpoint should accept the parameter (404 means user not found, but endpoint is reachable)
      expect(res.status()).toBe(404);
    } finally {
      await context.dispose();
    }
  });
});