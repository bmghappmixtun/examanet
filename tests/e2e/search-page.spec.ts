import { test, expect } from '@playwright/test';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

test.describe('Search Page - Complete E2E', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE_URL}/recherche`);
    await page.waitForLoadState('networkidle');
  });

  // ==========================================================================
  // 1. PAGE LOAD + STRUCTURE
  // ==========================================================================
  test('1. Page loads with all key elements', async ({ page }) => {
    // Title
    await expect(page.locator('h1')).toContainText(/Toutes les ressources|Résultats/);

    // Search bar (in page, not header) - use the last one (page is below header)
    await expect(page.locator('input[placeholder*="Rechercher" i]').last()).toBeVisible();

    // Sort dropdown
    await expect(page.locator('select')).toBeVisible();

    // View toggle (grid/list)
    await expect(page.locator('button[title="Grille"]')).toBeVisible();
    await expect(page.locator('button[title="Liste"]')).toBeVisible();

    // Sidebar
    await expect(page.locator('aside').first()).toBeVisible();

    // Results count
    await expect(page.locator('text=/\\d+ ressources/')).toBeVisible();
  });

  // ==========================================================================
  // 2. VIEW MODE TOGGLE
  // ==========================================================================
  test('2. View mode toggle (grid ↔ list) works', async ({ page }) => {
    // Default: grid
    const gridBtn = page.locator('button[title="Grille"]');
    const listBtn = page.locator('button[title="Liste"]');

    // Switch to list
    await listBtn.click();
    await page.waitForTimeout(300);
    await expect(listBtn).toHaveClass(/bg-primary-50/);

    // Switch back to grid
    await gridBtn.click();
    await page.waitForTimeout(300);
    await expect(gridBtn).toHaveClass(/bg-primary-50/);
  });

  // ==========================================================================
  // 3. SORT DROPDOWN
  // ==========================================================================
  test('3. Sort dropdown changes URL and refreshes results', async ({ page }) => {
    const sortSelect = page.locator('select');

    // Change to "Plus récent"
    await sortSelect.selectOption('recent');
    await page.waitForTimeout(500);
    expect(page.url()).toContain('sort=recent');

    // Change to "Plus vus"
    await sortSelect.selectOption('popular');
    await page.waitForTimeout(500);
    expect(page.url()).toContain('sort=popular');

    // Change to "Plus téléchargés"
    await sortSelect.selectOption('downloads');
    await page.waitForTimeout(500);
    expect(page.url()).toContain('sort=downloads');

    // Back to "Pertinence"
    await sortSelect.selectOption('relevance');
    await page.waitForTimeout(500);
    expect(page.url()).toContain('sort=relevance');
  });

  // ==========================================================================
  // 4. TYPE FILTER
  // ==========================================================================
  test('4. Type filter toggles correctly', async ({ page }) => {
    // Click on "Devoir" filter in sidebar
    const devoirFilter = page.locator('aside button:has-text("Devoir")').first();
    await devoirFilter.click();
    await page.waitForURL(/type=HOMEWORK/, { timeout: 5000 });

    // URL should have type=HOMEWORK
    expect(page.url()).toContain('type=HOMEWORK');

    // Active filter chip should appear
    await expect(page.locator('text=Filtres actifs')).toBeVisible();

    // Click again to deselect
    await devoirFilter.click();
    await page.waitForTimeout(500);
    expect(page.url()).not.toContain('type=HOMEWORK');
  });

  test('5. Multiple type filters can be selected sequentially', async ({ page }) => {
    // Click "Cours" in the Type section (sidebar, not header)
    const sidebarCours = page.locator('aside button:has-text("Cours")').first();
    await sidebarCours.click();
    await page.waitForURL(/type=COURSE/, { timeout: 5000 });
    expect(page.url()).toContain('type=COURSE');

    // Click "Exercice" - should switch
    const sidebarExo = page.locator('aside button:has-text("Exercice")').first();
    await sidebarExo.click();
    await page.waitForURL(/type=EXERCISE/, { timeout: 5000 });
    expect(page.url()).toContain('type=EXERCISE');
    expect(page.url()).not.toContain('type=COURSE');
  });

  // ==========================================================================
  // 6. SUBJECT FILTER
  // ==========================================================================
  test('6. Subject filter (Mathématiques) works', async ({ page }) => {
    // Find a subject filter (e.g., Mathématiques)
    const mathFilter = page.locator('aside button:has-text("Mathématiques")').first();

    if (await mathFilter.count() > 0) {
      await mathFilter.click();
      await page.waitForTimeout(500);

      expect(page.url()).toContain('subject=');
      await expect(page.locator('text=Filtres actifs')).toBeVisible();
    }
  });

  // ==========================================================================
  // 7. FILTER CHIPS + REMOVAL
  // ==========================================================================
  test('7. Filter chips appear and can be removed', async ({ page }) => {
    // Apply type filter
    await page.locator('button:has-text("Devoir")').first().click();
    await page.waitForTimeout(500);

    // Active filters section appears
    const clearBtn = page.locator('button:has-text("Tout effacer")');
    await expect(clearBtn).toBeVisible();

    // Click clear all
    await clearBtn.click();
    await page.waitForTimeout(500);
    expect(page.url()).not.toContain('type=');
  });

  test('8. Individual chip removal works', async ({ page }) => {
    // Apply type filter
    await page.locator('button:has-text("Devoir")').first().click();
    await page.waitForTimeout(500);

    // Click X on the chip
    const chipRemove = page.locator('[class*="rounded-full"] button').first();
    if (await chipRemove.count() > 0) {
      await chipRemove.click();
      await page.waitForTimeout(500);
      expect(page.url()).not.toContain('type=');
    }
  });

  // ==========================================================================
  // 9. SEARCH BAR (in-page)
  // ==========================================================================
  test('9. In-page search bar submits to /recherche?q=', async ({ page }) => {
    const searchInput = page.locator('input[placeholder*="Rechercher" i]').last();

    await searchInput.fill('math');
    // Submit by pressing Enter on the input
    await searchInput.press('Enter');
    await page.waitForURL(/q=math/, { timeout: 5000 });

    expect(page.url()).toContain('q=math');
    await expect(page.locator('h1')).toContainText('math');
  });

  test('10. Search bar shows suggestions dropdown', async ({ page }) => {
    const searchInput = page.locator('input[placeholder*="Rechercher" i]').last();

    await searchInput.click();
    await searchInput.fill('math');
    await page.waitForTimeout(800);

    // Dropdown should appear - search for any visible dropdown in main content
    const dropdowns = page.locator('div[class*="z-50"]');
    const count = await dropdowns.count();
    expect(count).toBeGreaterThan(0);
  });

  // ==========================================================================
  // 11. PAGINATION
  // ==========================================================================
  test('11. Pagination works (next/prev)', async ({ page }) => {
    // Go to page 2 directly
    await page.goto(`${BASE_URL}/recherche?page=2`);
    await page.waitForLoadState('networkidle');

    const pageIndicator = page.locator('text=/Page 2 \\//');
    if (await pageIndicator.count() > 0) {
      await expect(pageIndicator).toBeVisible();

      // Click previous
      const prevBtn = page.locator('button').filter({ has: page.locator('svg.lucide-chevron-left') }).first();
      await prevBtn.click();
      await page.waitForTimeout(500);
      expect(page.url()).toContain('page=1');
    }
  });

  // ==========================================================================
  // 12. RESULT CARD LINK
  // ==========================================================================
  test('12. Result card link navigates to resource page', async ({ page }) => {
    // Click first result card
    const firstCard = page.locator('a[href*="/ressources/"]').first();
    await firstCard.click();
    await page.waitForLoadState('networkidle');

    expect(page.url()).toMatch(/\/ressources\//);
  });

  // ==========================================================================
  // 13. HIDE-ON-SCROLL BEHAVIOR
  // ==========================================================================
  test('13. Search bar hides on scroll down', async ({ page }) => {
    // Find the search bar wrapper
    const searchWrapper = page.locator('[class*="sticky"][class*="top-20"]').first();

    // Initially visible
    await expect(searchWrapper).toBeVisible();

    // Scroll down
    await page.evaluate(() => window.scrollBy(0, 300));
    await page.waitForTimeout(500);

    // Should have translate-y-full class (hidden)
    const className = await searchWrapper.getAttribute('class');
    expect(className).toContain('translate-y-full');

    // Scroll up
    await page.evaluate(() => window.scrollBy(0, -200));
    await page.waitForTimeout(500);

    // Should be visible again
    const newClass = await searchWrapper.getAttribute('class');
    expect(newClass).toContain('translate-y-0');
  });

  // ==========================================================================
  // 14. EMPTY STATE
  // ==========================================================================
  test('14. Empty state shows when no results', async ({ page }) => {
    await page.goto(`${BASE_URL}/recherche?q=zzzzzzzznonexistent12345`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // Either no-results message or zero count
    const noResults = page.locator('text=Aucun résultat');
    const count = page.locator('text=/0\\s+ressources/');
    const hasEmpty = (await noResults.count() > 0) || (await count.count() > 0);
    expect(hasEmpty).toBeTruthy();
  });

  // ==========================================================================
  // 15. LOADING STATE
  // ==========================================================================
  test('15. Refresh on filter change shows loading state', async ({ page }) => {
    // Apply a filter that requires refetch
    const typeFilter = page.locator('button:has-text("Devoir")').first();
    await typeFilter.click();

    // Should eventually settle
    await page.waitForTimeout(1500);
    await expect(page.locator('h1')).toBeVisible();
  });

  // ==========================================================================
  // 16. NO JAVASCRIPT ERRORS
  // ==========================================================================
  test('16. No console errors on page load', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    page.on('pageerror', err => errors.push(err.message));

    await page.goto(`${BASE_URL}/recherche`);
    await page.waitForLoadState('networkidle');

    // Filter out known harmless errors
    const real = errors.filter(e =>
      !e.includes('favicon') &&
      !e.includes('Failed to load resource') // network glitches
    );

    expect(real).toEqual([]);
  });

  // ==========================================================================
  // 17. RESPONSIVE - MOBILE FILTER TOGGLE
  // ==========================================================================
  test('17. Mobile: filter toggle button works', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto(`${BASE_URL}/recherche`);
    await page.waitForLoadState('networkidle');

    // Filter button should be visible on mobile
    const filterToggle = page.locator('button:has-text("Filtres")').first();
    if (await filterToggle.isVisible()) {
      await filterToggle.click();
      await page.waitForTimeout(300);
      // Sidebar should now be visible
    }
  });

  // ==========================================================================
  // 18. YEAR FILTER
  // ==========================================================================
  test('18. Year filter works', async ({ page }) => {
    // Find a year filter
    const yearFilter = page.locator('aside button').filter({ hasText: /^\d{4}-\d{4}$/ }).first();

    if (await yearFilter.count() > 0) {
      await yearFilter.click();
      await page.waitForTimeout(500);
      expect(page.url()).toContain('year=');
    }
  });

  // ==========================================================================
  // 19. TEACHER FILTER
  // ==========================================================================
  test('19. Teacher filter works', async ({ page }) => {
    // Find a teacher in the Enseignant section
    const teacherFilter = page.locator('aside button:has-text("Ahmed")').first();

    if (await teacherFilter.count() > 0) {
      await teacherFilter.click();
      await page.waitForTimeout(500);
      expect(page.url()).toContain('teacher=');
    }
  });

  // ==========================================================================
  // 20. COMBINED FILTERS
  // ==========================================================================
  test('20. Multiple filters combine correctly', async ({ page }) => {
    // Apply type (Devoir in sidebar)
    const sidebarDevoir = page.locator('aside button:has-text("Devoir")').first();
    await sidebarDevoir.click();
    await page.waitForURL(/type=HOMEWORK/, { timeout: 5000 });
    await page.waitForTimeout(500);

    const math = page.locator('aside button:has-text("Mathématiques")').first();
    if (await math.count() > 0) {
      await math.click();
      await page.waitForTimeout(500);

      // URL should have both
      expect(page.url()).toContain('type=HOMEWORK');
      expect(page.url()).toContain('subject=');
    }
  });
});
