import { test, expect } from '@playwright/test';

const BASE_URL = 'https://examanet.com';
const TEST_TOKEN = 'cffa7e495ff6a441d253b03b8cf1efa7';

test('Full OTP flow - student registration', async ({ page, request }) => {
  // Generate unique email
  const email = `test.e2e.${Date.now()}@example.com`;

  // 1. Register
  const regRes = await request.post(`${BASE_URL}/api/auth/register`, {
    data: {
      firstName: 'E2E',
      lastName: 'Test',
      email,
      password: 'Test1234!',
      role: 'STUDENT'
    }
  });
  expect(regRes.status()).toBe(200);
  const regData = await regRes.json();
  expect(regData.requiresVerification).toBe(true);

  // 2. Get OTP
  const otpRes = await request.get(`${BASE_URL}/api/test/get-otp?email=${email}&token=${TEST_TOKEN}`);
  const otpData = await otpRes.json();
  console.log('OTP:', otpData.code);

  // 3. Verify OTP
  const verifyRes = await request.post(`${BASE_URL}/api/auth/verify-otp`, {
    data: { email, code: otpData.code }
  });
  expect(verifyRes.status()).toBe(200);
  const verifyData = await verifyRes.json();
  expect(verifyData.success).toBe(true);
  expect(verifyData.status).toBe('ACTIVE');

  // 4. Try to access protected page
  await page.goto(`${BASE_URL}/connexion`);
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', 'Test1234!');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2000);
  console.log('URL after login:', page.url());
});

test('Full OTP flow - teacher registration', async ({ page, request }) => {
  const email = `teacher.e2e.${Date.now()}@example.com`;

  // 1. Register
  const regRes = await request.post(`${BASE_URL}/api/auth/register`, {
    data: {
      firstName: 'Teacher',
      lastName: 'E2E',
      email,
      password: 'Test1234!',
      role: 'TEACHER',
      schoolName: 'Test School'
    }
  });
  expect(regRes.status()).toBe(200);

  // 2. Get OTP
  const otpRes = await request.get(`${BASE_URL}/api/test/get-otp?email=${email}&token=${TEST_TOKEN}`);
  const otpData = await otpRes.json();

  // 3. Verify OTP
  const verifyRes = await request.post(`${BASE_URL}/api/auth/verify-otp`, {
    data: { email, code: otpData.code }
  });
  const verifyData = await verifyRes.json();
  console.log('Teacher verify:', verifyData);
  expect(verifyData.status).toBe('PENDING_APPROVAL');
});
