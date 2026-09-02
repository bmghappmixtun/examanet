import { test, expect } from '@playwright/test';

const BASE_URL = 'https://examanet.com';
const TEST_TOKEN = 'cffa7e495ff6a441d253b03b8cf1efa7';

test('Full UI OTP flow - student', async ({ page, request }) => {
  const email = `ui.test.${Date.now()}@example.com`;

  // 1. Go to register
  await page.goto(`${BASE_URL}/inscription`);
  await page.waitForLoadState('networkidle');

  // 2. Fill form
  await page.fill('input[placeholder="Prénom"]', 'UI');
  await page.fill('input[placeholder="Nom"]', 'Test');
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', 'Test1234!');

  // 3. Click student button (default), then submit
  await page.click('button[type="submit"]');

  // 4. Should redirect to /verifier
  await page.waitForURL(/\/verifier/, { timeout: 10000 });
  expect(page.url()).toContain('/verifier');
  expect(page.url()).toContain(encodeURIComponent(email));

  await page.screenshot({ path: 'tests/e2e/screenshots/otp-page.png' });

  // 5. Get the OTP from test endpoint
  const otpRes = await request.get(`${BASE_URL}/api/test/get-otp?email=${email}&token=${TEST_TOKEN}`);
  const otpData = await otpRes.json();
  console.log('OTP code:', otpData.code, 'attempts:', otpData.attempts);

  // 6. Type the code
  const codeStr = otpData.code;
  for (let i = 0; i < 6; i++) {
    const input = page.locator('input[inputmode="numeric"]').nth(i);
    await input.fill(codeStr[i]);
  }

  // 7. Click verify
  await page.click('button:has-text("Vérifier")');

  // 8. Should redirect to /mon-compte
  await page.waitForURL(/\/mon-compte/, { timeout: 10000 });
  expect(page.url()).toContain('/mon-compte');

  await page.screenshot({ path: 'tests/e2e/screenshots/otp-success.png' });
});

test('Full UI OTP flow - teacher', async ({ page, request }) => {
  const email = `ui.teacher.${Date.now()}@example.com`;

  await page.goto(`${BASE_URL}/inscription`);
  await page.waitForLoadState('networkidle');

  await page.fill('input[placeholder="Prénom"]', 'Teacher');
  await page.fill('input[placeholder="Nom"]', 'UI');
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', 'Test1234!');

  // Click teacher button
  await page.click('button:has-text("Enseignant")');
  await page.waitForTimeout(300);

  // Fill school name if there's a field
  const schoolInput = page.locator('input[placeholder*="école" i], input[placeholder*="school" i]').first();
  if (await schoolInput.count() > 0) {
    await schoolInput.fill('Test School');
  }

  await page.click('button[type="submit"]');
  await page.waitForURL(/\/verifier/, { timeout: 10000 });

  await page.screenshot({ path: 'tests/e2e/screenshots/otp-teacher-page.png' });

  // Get OTP
  const otpRes = await request.get(`${BASE_URL}/api/test/get-otp?email=${email}&token=${TEST_TOKEN}`);
  const otpData = await otpRes.json();
  console.log('Teacher OTP:', otpData.code);

  // Type code
  for (let i = 0; i < 6; i++) {
    await page.locator('input[inputmode="numeric"]').nth(i).fill(otpData.code[i]);
  }

  await page.click('button:has-text("Vérifier")');

  // Teacher goes to /en-attente
  await page.waitForURL(/\/en-attente/, { timeout: 10000 });
  expect(page.url()).toContain('/en-attente');

  await page.screenshot({ path: 'tests/e2e/screenshots/otp-teacher-success.png' });
});
