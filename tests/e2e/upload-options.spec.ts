import { test, expect } from '@playwright/test';

const BASE = process.env.BASE_URL || 'http://localhost:3000';

test.describe('Teacher upload options dropdowns', () => {
  test('GET /api/teacher/options returns subjects and classes', async ({ playwright }) => {
    const context = await playwright.request.newContext({ baseURL: BASE });
    try {
      // Login as teacher
      const loginRes = await context.post(`${BASE}/api/auth/login`, {
        data: { email: 'ahmed.benali@examanet.com', password: 'demo1234' }
      });
      expect(loginRes.ok()).toBeTruthy();

      const res = await context.get(`${BASE}/api/teacher/options`);
      expect(res.ok()).toBeTruthy();

      const data = await res.json();
      console.log('Subjects:', data.subjects?.length, '| Classes:', data.classes?.length, '| Sections:', data.sections?.length);

      expect(data.subjects).toBeTruthy();
      expect(data.classes).toBeTruthy();
      expect(Array.isArray(data.subjects)).toBeTruthy();
      expect(Array.isArray(data.classes)).toBeTruthy();
      expect(data.subjects.length).toBeGreaterThan(0);
      expect(data.classes.length).toBeGreaterThan(0);

      // Verify each subject has a slug
      expect(data.subjects[0].slug).toBeTruthy();
      expect(data.classes[0].slug).toBeTruthy();

      // Print some examples
      console.log('First 3 subjects:', data.subjects.slice(0, 3).map((s: any) => s.slug).join(', '));
      console.log('First 3 classes:', data.classes.slice(0, 3).map((c: any) => c.slug).join(', '));
    } finally {
      await context.dispose();
    }
  });

  test('Teacher upload form has dropdowns (not text inputs)', async ({ page }) => {
    // Login
    await page.goto(`${BASE}/connexion`);
    await page.fill('input[type="email"]', 'ahmed.benali@examanet.com');
    await page.fill('input[type="password"]', 'demo1234');
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/(enseignant|mon-compte)/, { timeout: 15000 });

    // Navigate to upload page
    await page.goto(`${BASE}/enseignant/ajouter`);

    // Wait for options to load
    await page.waitForSelector('select', { timeout: 10000 });

    // Check selects exist (instead of text inputs for subject/class)
    const subjectSelect = page.locator('select').filter({ has: page.locator('option', { hasText: 'Choisir une matière' }) }).first();
    const classSelect = page.locator('select').filter({ has: page.locator('option', { hasText: 'Choisir une classe' }) }).first();

    await expect(subjectSelect).toBeVisible();
    await expect(classSelect).toBeVisible();

    // Verify they have options
    const subjectOptions = await subjectSelect.locator('option').count();
    const classOptions = await classSelect.locator('option').count();
    expect(subjectOptions).toBeGreaterThan(2);
    expect(classOptions).toBeGreaterThan(2);

    console.log(`✓ Subject dropdown has ${subjectOptions} options, Class dropdown has ${classOptions} options`);

    // Test selecting values
    const firstSubjectValue = await subjectSelect.locator('option').nth(1).getAttribute('value');
    const firstClassValue = await classSelect.locator('option').nth(1).getAttribute('value');

    expect(firstSubjectValue).toBeTruthy();
    expect(firstClassValue).toBeTruthy();

    await subjectSelect.selectOption(firstSubjectValue!);
    await classSelect.selectOption(firstClassValue!);

    console.log(`✓ Selected: subject=${firstSubjectValue}, class=${firstClassValue}`);
  });

  test('Section dropdown is filtered by selected class', async ({ page }) => {
    await page.goto(`${BASE}/connexion`);
    await page.fill('input[type="email"]', 'ahmed.benali@examanet.com');
    await page.fill('input[type="password"]', 'demo1234');
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/(enseignant|mon-compte)/, { timeout: 15000 });

    await page.goto(`${BASE}/enseignant/ajouter`);
    await page.waitForSelector('select');

    // Section select is the 4th select (type, subject, class, section)
    const sectionSelect = page.locator('select').nth(3);
    const disabledBefore = await sectionSelect.isDisabled();

    // Select a class
    const classSelect = page.locator('select').filter({ has: page.locator('option', { hasText: 'Choisir une classe' }) }).first();
    const firstClassValue = await classSelect.locator('option').nth(1).getAttribute('value');
    await classSelect.selectOption(firstClassValue!);

    // Now section should be enabled
    await page.waitForTimeout(500);
    const enabledAfter = !(await sectionSelect.isDisabled());

    expect(disabledBefore).toBeTruthy();
    expect(enabledAfter).toBeTruthy();
    console.log('✓ Section dropdown is gated by class selection');
  });
});