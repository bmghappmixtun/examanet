import { test, expect } from '@playwright/test';

const TEACHER_EMAIL = 'mohamed.gharbi@examanet.com';
const TEACHER_PASSWORD = 'demo1234';

test('rejected resource: owner can view it (no 404)', async ({ page }) => {
  // Find a rejected resource for this teacher
  // (we created some in previous test runs)
  const rejectedSlug = 'test-rejection-1782219384520';

  // Login as the teacher
  await page.goto('/connexion');
  await page.fill('input[type="email"]', TEACHER_EMAIL);
  await page.fill('input[type="password"]', TEACHER_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/mon-compte|enseignant/, { timeout: 15000 });

  // Visit the rejected resource
  const res = await page.goto(`/ressources/${rejectedSlug}`);
  // Should NOT be 404 - the owner should be able to see their rejected resource
  expect(res?.status()).not.toBe(404);
  // Should show the page
  await expect(page.locator('h1').first()).toBeVisible();
  console.log('Status:', res?.status());
  console.log('Title:', await page.locator('h1').first().textContent());
});

test('rejected resource: anonymous visitor gets 404', async ({ page }) => {
  const rejectedSlug = 'test-rejection-1782219384520';
  // Don't login
  const res = await page.goto(`/ressources/${rejectedSlug}`);
  // Anonymous visitor should be 404 for rejected resource
  // Check the body for 'not found' content
  const body = await page.content();
  expect(body).toMatch(/404|Introuvable|non trouv/);  // not-found page rendered
});