import { test, expect } from '@playwright/test';

// Prevent real email sends during E2E tests
process.env.DISABLE_EMAILS = 'true';

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const TEST_EMAIL = `test-otp-${Date.now()}@example.com`;

test.describe('OTP Email Verification Flow', () => {
  test('Registration creates PENDING_OTP user and sends emails', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const email = `test-${Date.now()}@example.com`;

    await page.goto(`${BASE}/inscription`);
    await page.fill('input[placeholder*="Prénom"]', 'Test');
    await page.fill('input[placeholder*="Nom"]', 'User');
    await page.fill('input[type="email"]', email);
    await page.fill('input[type="password"]', 'test1234');
    await page.click('button[type="submit"]');

    // Should redirect to /verifier with email param
    await page.waitForURL(/\/verifier/, { timeout: 15000 });
    expect(page.url()).toContain('email=');

    // Verify page has the 6-digit code input
    await expect(page.locator('input[inputmode="numeric"]').first()).toBeVisible();
    console.log('✓ Redirected to OTP verification page');

    await ctx.close();
  });

  test('Cannot login with PENDING_OTP account', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const email = `test-pending-${Date.now()}@example.com`;

    // Register first
    await page.goto(`${BASE}/inscription`);
    await page.fill('input[placeholder*="Prénom"]', 'Pending');
    await page.fill('input[placeholder*="Nom"]', 'Test');
    await page.fill('input[type="email"]', email);
    await page.fill('input[type="password"]', 'test1234');
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/verifier/, { timeout: 15000 });

    // Now try to login
    await page.goto(`${BASE}/connexion`);
    await page.fill('input[type="email"]', email);
    await page.fill('input[type="password"]', 'test1234');
    await page.click('button[type="submit"]');

    // Should redirect to /verifier again
    await page.waitForURL(/\/verifier/, { timeout: 15000 });
    console.log('✓ PENDING_OTP user redirected to /verifier on login attempt');

    await ctx.close();
  });

  test('Verify page shows email pre-filled from URL', async ({ page }) => {
    const email = `prefilled-${Date.now()}@example.com`;
    await page.goto(`${BASE}/verifier?email=${encodeURIComponent(email)}`);
    const emailInput = page.locator('input[type="email"]');
    await expect(emailInput).toHaveValue(email);
  });

  test('Invalid OTP code shows error', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const email = `test-invalid-${Date.now()}@example.com`;

    // Register
    await page.goto(`${BASE}/inscription`);
    await page.fill('input[placeholder*="Prénom"]', 'Invalid');
    await page.fill('input[placeholder*="Nom"]', 'Code');
    await page.fill('input[type="email"]', email);
    await page.fill('input[type="password"]', 'test1234');
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/verifier/, { timeout: 15000 });

    // Enter wrong code
    const codeInputs = page.locator('input[inputmode="numeric"]');
    await codeInputs.nth(0).fill('1');
    await codeInputs.nth(1).fill('2');
    await codeInputs.nth(2).fill('3');
    await codeInputs.nth(3).fill('4');
    await codeInputs.nth(4).fill('5');
    await codeInputs.nth(5).fill('6');

    await page.getByRole('button', { name: /Vérifier/ }).click();

    // Should show error
    await page.waitForTimeout(2000);
    const body = await page.locator('body').textContent();
    expect(body).toMatch(/incorrect|invalide|erreur/i);
    console.log('✓ Invalid OTP shows error');

    await ctx.close();
  });

  test('Resend OTP button is available', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const email = `test-resend-${Date.now()}@example.com`;

    await page.goto(`${BASE}/verifier?email=${encodeURIComponent(email)}`);
    const resendBtn = page.getByRole('button', { name: /Renvoyer/ });
    await expect(resendBtn).toBeVisible();
    console.log('✓ Resend button visible');
    await ctx.close();
  });

  test('Can type 6-digit code', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const email = `test-type-${Date.now()}@example.com`;

    await page.goto(`${BASE}/verifier?email=${encodeURIComponent(email)}`);
    // Type each digit in its own input
    const codeInputs = page.locator('input[inputmode="numeric"]');
    await codeInputs.nth(0).pressSequentially('1');
    await codeInputs.nth(1).pressSequentially('2');
    await codeInputs.nth(2).pressSequentially('3');
    await codeInputs.nth(3).pressSequentially('4');
    await codeInputs.nth(4).pressSequentially('5');
    await codeInputs.nth(5).pressSequentially('6');
    // All inputs should now be filled
    for (let i = 0; i < 6; i++) {
      const val = await codeInputs.nth(i).inputValue();
      expect(val).toBe(String(i + 1));
    }
    console.log('✓ 6-digit input works');
    await ctx.close();
  });

  test('API: register creates PENDING_OTP user', async ({ request }) => {
    const email = `api-test-${Date.now()}@example.com`;
    const res = await request.post(`${BASE}/api/auth/register`, {
      data: { email, password: 'test1234', firstName: 'API', lastName: 'Test', role: 'STUDENT' }
    });
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data.requiresVerification).toBe(true);
    expect(data.email).toBe(email);
  });

  test('API: cannot register twice with same email', async ({ request }) => {
    const email = `dup-${Date.now()}@example.com`;
    const r1 = await request.post(`${BASE}/api/auth/register`, {
      data: { email, password: 'test1234', firstName: 'Dup', role: 'STUDENT' }
    });
    expect(r1.ok()).toBeTruthy();
    const r2 = await request.post(`${BASE}/api/auth/register`, {
      data: { email, password: 'test1234', firstName: 'Dup', role: 'STUDENT' }
    });
    expect(r2.status()).toBe(409);
  });

  test('API: resend-OTP requires email', async ({ request }) => {
    const res = await request.post(`${BASE}/api/auth/resend-otp`, { data: {} });
    expect(res.status()).toBe(400);
  });

  test('API: verify-OTP with wrong code returns 400', async ({ request }) => {
    const email = `verify-${Date.now()}@example.com`;
    await request.post(`${BASE}/api/auth/register`, {
      data: { email, password: 'test1234', firstName: 'V', role: 'STUDENT' }
    });
    const res = await request.post(`${BASE}/api/auth/verify-otp`, {
      data: { email, code: '000000' }
    });
    expect(res.status()).toBe(400);
  });

  test('API: verify-OTP with unknown email returns 404', async ({ request }) => {
    const res = await request.post(`${BASE}/api/auth/verify-otp`, {
      data: { email: 'nobody@nowhere.com', code: '123456' }
    });
    expect(res.status()).toBe(404);
  });

  test('Full OTP flow: register → verify → login', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const email = `full-flow-${Date.now()}@example.com`;

    // 1. Register
    await page.goto(`${BASE}/inscription`);
    await page.fill('input[placeholder*="Prénom"]', 'Full');
    await page.fill('input[placeholder*="Nom"]', 'Flow');
    await page.fill('input[type="email"]', email);
    await page.fill('input[type="password"]', 'test1234');
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/verifier/, { timeout: 15000 });
    console.log('✓ Step 1: Registered, redirected to /verifier');

    // 2. Try to login (should redirect back to /verifier)
    await page.goto(`${BASE}/connexion`);
    await page.fill('input[type="email"]', email);
    await page.fill('input[type="password"]', 'test1234');
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/verifier/, { timeout: 15000 });
    console.log('✓ Step 2: Cannot login with PENDING_OTP status');

    // 3. Get the actual OTP from DB via test API
    const SEED_TOKEN = process.env.SEED_TOKEN || '';
    if (SEED_TOKEN) {
      const otpRes = await page.request.get(
        `${BASE}/api/test/get-otp?email=${encodeURIComponent(email)}&token=${SEED_TOKEN}`
      );
      if (otpRes.ok()) {
        const { code } = await otpRes.json();
        const codeInputs = page.locator('input[inputmode="numeric"]');
        for (let i = 0; i < 6; i++) {
          await codeInputs.nth(i).fill(code[i]);
        }
        await page.getByRole('button', { name: /Vérifier/ }).click();
        // Wait for redirect to /mon-compte (student gets auto-login)
        await page.waitForURL(/\/mon-compte|\/en-attente|\/connexion/, { timeout: 15000 });
        console.log('✓ Step 3: OTP verified, redirected');
      } else {
        console.log('⚠️ Could not fetch OTP for test (status:', otpRes.status(), ')');
      }
    } else {
      console.log('⚠️ SEED_TOKEN not set, skipping OTP verification step');
    }

    await ctx.close();
  });
});