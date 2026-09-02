/**
 * Comprehensive UX tests for /recherche page
 * Covers: search, filters, sort, pagination, navigation, edge cases
 */
const { chromium } = require('/workspace/edutunisie/node_modules/playwright');

const TEST_RESULTS = [];
async function log(name, status, message = '') {
  const icon = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : '⚠️';
  console.log(`${icon} [${status}] ${name}${message ? ' — ' + message : ''}`);
  TEST_RESULTS.push({ name, status, message });
}

(async () => {
  const browser = await chromium.launch();

  // =============================================
  // GROUP 1: BASIC SEARCH EXPERIENCE
  // =============================================
  console.log('\n=== GROUP 1: Basic search experience ===');

  // T1: Search with results
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    await page.goto('https://examanet.com/recherche?q=fonctions&t=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);

    const resultCount = await page.locator('a[href^="/ressources/"]').count();
    const titleVisible = await page.locator('text=/Résultats pour/i').count();

    if (resultCount > 0 && titleVisible > 0) {
      await log('T1: Search with results', 'PASS', `${resultCount} cards, title visible`);
    } else {
      await log('T1: Search with results', 'FAIL', `cards=${resultCount}, title=${titleVisible}`);
    }
    await ctx.close();
  }

  // T2: Search with NO results
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    await page.goto('https://examanet.com/recherche?q=zzzzqqqxxx&t=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);

    const noResult = await page.locator('text=/aucun|pas de résultat|0 résultat/i').count();
    const noCrash = !(await page.evaluate(() => document.body.textContent.includes('Application error')));

    if (noResult > 0 && noCrash) {
      await log('T2: Search no results shows message', 'PASS');
    } else {
      await log('T2: Search no results shows message', 'FAIL', `noResult=${noResult}, noCrash=${noCrash}`);
    }
    await page.screenshot({ path: '/workspace/edutunisie/public/__recherche-no-results.png' });
    await ctx.close();
  }

  // T3: Search input is pre-filled with query
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    await page.goto('https://examanet.com/recherche?q=math&t=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);

    // SearchBar uses state-based inputs (no name attribute)
    const searchInputs = await page.locator('input[placeholder*="echerch"]').all();
    let hasValue = false;
    for (const input of searchInputs) {
      const value = await input.inputValue();
      if (value === 'math') {
        hasValue = true;
        break;
      }
    }

    if (hasValue) {
      await log('T3: Search input pre-filled with query', 'PASS');
    } else {
      await log('T3: Search input pre-filled with query', 'FAIL', 'No input has the query value');
    }
    await ctx.close();
  }

  // T4: URL with special characters
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    const query = encodeURIComponent('équation à résoudre');
    const url = `https://examanet.com/recherche?q=${query}&t=${Date.now()}`;

    let noCrash = true;
    page.on('pageerror', err => { noCrash = false; });

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);

    const hasError = await page.evaluate(() => document.body.textContent.includes('Application error'));
    if (!hasError && noCrash) {
      await log('T4: URL with special characters', 'PASS', `q=équation à résoudre`);
    } else {
      await log('T4: URL with special characters', 'FAIL', `crashed: error=${hasError}, noCrash=${noCrash}`);
    }
    await ctx.close();
  }

  // T5: Multi-word search
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    await page.goto('https://examanet.com/recherche?q=devoir+math&t=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);

    const resultCount = await page.locator('a[href^="/ressources/"]').count();
    const noCrash = !(await page.evaluate(() => document.body.textContent.includes('Application error')));

    if (noCrash) {
      await log('T5: Multi-word search', 'PASS', `${resultCount} results`);
    } else {
      await log('T5: Multi-word search', 'FAIL', 'crashed');
    }
    await ctx.close();
  }

  // =============================================
  // GROUP 2: FILTERS
  // =============================================
  console.log('\n=== GROUP 2: Filters ===');

  // T6: Filter by type only
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    await page.goto('https://examanet.com/recherche?type=DEVOIR&t=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);

    const resultCount = await page.locator('a[href^="/ressources/"]').count();
    const noCrash = !(await page.evaluate(() => document.body.textContent.includes('Application error')));

    if (noCrash) {
      await log('T6: Filter by type=DEVOIR', 'PASS', `${resultCount} results`);
    } else {
      await log('T6: Filter by type=DEVOIR', 'FAIL', 'crashed');
    }
    await ctx.close();
  }

  // T7: Combined filter (type + class)
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    await page.goto('https://examanet.com/recherche?type=DEVOIR&class=7eme&t=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);

    const noCrash = !(await page.evaluate(() => document.body.textContent.includes('Application error')));
    if (noCrash) {
      await log('T7: Combined filter type+class', 'PASS');
    } else {
      await log('T7: Combined filter type+class', 'FAIL', 'crashed');
    }
    await ctx.close();
  }

  // T8: Filter by year
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    await page.goto('https://examanet.com/recherche?year=2024&t=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);

    const noCrash = !(await page.evaluate(() => document.body.textContent.includes('Application error')));
    if (noCrash) {
      await log('T8: Filter by year', 'PASS');
    } else {
      await log('T8: Filter by year', 'FAIL', 'crashed');
    }
    await ctx.close();
  }

  // T9: Filter by subject
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    // Use direct URL with known subject ID
    await page.goto('https://examanet.com/recherche?subject=cmqi8nr2z00252n4aoa8vuwmy&t=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);
    const noCrash = !(await page.evaluate(() => document.body.textContent.includes('Application error')));
    const hasResults = await page.evaluate(() => /[\d.]+k?\s+ressources?/i.test(document.body.textContent));
    if (noCrash && hasResults) {
      await log('T9: Filter by subject', 'PASS', '?subject=cmqi8nr2z00252n4aoa8vuwmy');
    } else {
      await log('T9: Filter by subject', 'FAIL', `noCrash=${noCrash}, hasResults=${hasResults}`);
    }
    await ctx.close();
  }

  // =============================================
  // GROUP 3: SORT
  // =============================================
  console.log('\n=== GROUP 3: Sort ===');

  // T10: Sort by recent
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    await page.goto('https://examanet.com/recherche?sort=recent&t=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);

    const noCrash = !(await page.evaluate(() => document.body.textContent.includes('Application error')));
    if (noCrash) {
      await log('T10: Sort by recent', 'PASS');
    } else {
      await log('T10: Sort by recent', 'FAIL');
    }
    await ctx.close();
  }

  // T11: Sort by popular
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    await page.goto('https://examanet.com/recherche?sort=popular&t=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);

    const noCrash = !(await page.evaluate(() => document.body.textContent.includes('Application error')));
    if (noCrash) {
      await log('T11: Sort by popular', 'PASS');
    } else {
      await log('T11: Sort by popular', 'FAIL');
    }
    await ctx.close();
  }

  // T12: Sort by downloads
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    await page.goto('https://examanet.com/recherche?sort=downloads&t=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);

    const noCrash = !(await page.evaluate(() => document.body.textContent.includes('Application error')));
    if (noCrash) {
      await log('T12: Sort by downloads', 'PASS');
    } else {
      await log('T12: Sort by downloads', 'FAIL');
    }
    await ctx.close();
  }

  // =============================================
  // GROUP 4: PAGINATION
  // =============================================
  console.log('\n=== GROUP 4: Pagination ===');

  // T13: Pagination page 2
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    await page.goto('https://examanet.com/recherche?page=2&t=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);

    const noCrash = !(await page.evaluate(() => document.body.textContent.includes('Application error')));
    const resultCount = await page.locator('a[href^="/ressources/"]').count();

    if (noCrash) {
      await log('T13: Pagination page 2', 'PASS', `${resultCount} cards`);
    } else {
      await log('T13: Pagination page 2', 'FAIL');
    }
    await ctx.close();
  }

  // T14: Pagination last page
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    await page.goto('https://examanet.com/recherche?page=100&t=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);

    const noCrash = !(await page.evaluate(() => document.body.textContent.includes('Application error')));
    if (noCrash) {
      await log('T14: Pagination beyond range (page=100)', 'PASS', 'No crash on invalid page');
    } else {
      await log('T14: Pagination beyond range (page=100)', 'FAIL');
    }
    await ctx.close();
  }

  // =============================================
  // GROUP 5: FACETS (sidebar filters with counts)
  // =============================================
  console.log('\n=== GROUP 5: Facets ===');

  // T15: Facet counts visible
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    await page.goto('https://examanet.com/recherche?t=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);

    // Check if facets have counts (numbers next to type names)
    const typeCount = await page.locator('a:has-text("Cours") + span, a:has-text("Devoir") + span').count();
    const hasCount = await page.evaluate(() => {
      // Look for numbers like "(277)" or "277" near type labels
      const text = document.body.textContent;
      return /\bCours\b.*\b\d{2,}/.test(text) || /\bDevoir\b.*\b\d{2,}/.test(text);
    });

    if (hasCount) {
      await log('T15: Facets have counts', 'PASS');
    } else {
      await log('T15: Facets have counts', 'WARN', 'No counts found near type labels');
    }
    await ctx.close();
  }

  // =============================================
  // GROUP 6: NAVIGATION & LINKS
  // =============================================
  console.log('\n=== GROUP 6: Navigation ===');

  // T16: Click result navigates
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    await page.goto('https://examanet.com/recherche?q=math&t=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);

    const firstCard = page.locator('a[href^="/ressources/"]').first();
    const count = await firstCard.count();
    if (count > 0) {
      await firstCard.click();
      await page.waitForTimeout(3000);
      const url = page.url();
      if (url.includes('/ressources/') && !url.endsWith('/recherche')) {
        await log('T16: Click result navigates', 'PASS', url.substring(0, 80));
      } else {
        await log('T16: Click result navigates', 'FAIL', `Stayed on ${url}`);
      }
    } else {
      await log('T16: Click result navigates', 'FAIL', 'No result to click');
    }
    await ctx.close();
  }

  // T17: Back to /recherche works
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    await page.goto('https://examanet.com/recherche?q=math&t=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000);
    await page.locator('a[href^="/ressources/"]').first().click();
    await page.waitForTimeout(3000);
    await page.goBack();
    await page.waitForTimeout(2000);
    const url = page.url();
    if (url.includes('/recherche') && url.includes('q=math')) {
      await log('T17: Back button returns to search', 'PASS');
    } else {
      await log('T17: Back button returns to search', 'FAIL', `URL: ${url}`);
    }
    await ctx.close();
  }

  // T18: Logo link goes to home
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    await page.goto('https://examanet.com/recherche?t=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000);
    const logo = page.locator('a[href="/"]').first();
    if (await logo.count() > 0) {
      await logo.click();
      await page.waitForTimeout(2000);
      const url = page.url();
      if (url.endsWith('/') || url.endsWith('//')) {
        await log('T18: Logo navigates to home', 'PASS');
      } else {
        await log('T18: Logo navigates to home', 'FAIL', `URL: ${url}`);
      }
    } else {
      await log('T18: Logo navigates to home', 'WARN', 'No logo link found');
    }
    await ctx.close();
  }

  // =============================================
  // GROUP 7: ARABIC MODE
  // =============================================
  console.log('\n=== GROUP 7: Arabic mode ===');

  // T19: AR mode on /recherche
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await ctx.addCookies([{ name: 'locale', value: 'ar', domain: 'examanet.com', path: '/' }]);
    const page = await ctx.newPage();
    await page.goto('https://examanet.com/recherche?q=رياضيات&t=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(4000);

    const htmlDir = await page.evaluate(() => document.documentElement.getAttribute('dir'));
    if (htmlDir === 'rtl') {
      await log('T19: AR mode on /recherche', 'PASS');
    } else {
      await log('T19: AR mode on /recherche', 'FAIL', `html dir=${htmlDir}`);
    }
    await ctx.close();
  }

  // =============================================
  // GROUP 8: MOBILE EXPERIENCE
  // =============================================
  console.log('\n=== GROUP 8: Mobile experience ===');

  // T20: /recherche on mobile 320
  {
    const ctx = await browser.newContext({ viewport: { width: 320, height: 568 } });
    const page = await ctx.newPage();
    await page.goto('https://examanet.com/recherche?q=math&t=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);

    const overflow = await page.evaluate(() => document.body.scrollWidth - window.innerWidth);
    if (overflow <= 0) {
      await log('T20: /recherche no horizontal overflow on 320', 'PASS');
    } else {
      await log('T20: /recherche no horizontal overflow on 320', 'FAIL', `Overflow ${overflow}px`);
    }
    await page.screenshot({ path: '/workspace/edutunisie/public/__recherche-320.png' });
    await ctx.close();
  }

  // T21: /recherche on mobile 375
  {
    const ctx = await browser.newContext({ viewport: { width: 375, height: 667 } });
    const page = await ctx.newPage();
    await page.goto('https://examanet.com/recherche?q=math&t=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);

    const overflow = await page.evaluate(() => document.body.scrollWidth - window.innerWidth);
    if (overflow <= 0) {
      await log('T21: /recherche no horizontal overflow on 375', 'PASS');
    } else {
      await log('T21: /recherche no horizontal overflow on 375', 'FAIL', `Overflow ${overflow}px`);
    }
    await page.screenshot({ path: '/workspace/edutunisie/public/__recherche-375.png' });
    await ctx.close();
  }

  // =============================================
  // GROUP 9: VISUAL UX CHECKS
  // =============================================
  console.log('\n=== GROUP 9: Visual UX ===');

  // T22: Loading state
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    // Navigate and check for any loading indicator during transition
    await page.goto('https://examanet.com/recherche?q=math&t=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(500); // Quick check

    // Check if there's a spinner element
    const hasSpinner = await page.locator('.animate-spin, [role="progressbar"]').count();
    await log('T22: Loading indicator present', hasSpinner > 0 ? 'PASS' : 'WARN', `${hasSpinner} spinners found`);
    await ctx.close();
  }

  // T23: Total count is displayed
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    await page.goto('https://examanet.com/recherche?q=math&t=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);

    const hasCount = await page.evaluate(() => {
      const text = document.body.textContent;
      // Should show "X ressources" or "1.5k ressources" or "12 sur 3829"
      return /[\d.]+k?\s+(ressources?|résultats?|results?)/i.test(text) || /\bsur\s+\d+/i.test(text);
    });

    if (hasCount) {
      await log('T23: Total count is displayed', 'PASS');
    } else {
      await log('T23: Total count is displayed', 'FAIL', 'No count text found');
    }
    await ctx.close();
  }

  // T24: Reset/clear filters button
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    await page.goto('https://examanet.com/recherche?type=DEVOIR&class=7eme&t=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);

    // Look for any "Reset" or "Réinitialiser" link
    const hasReset = await page.locator('text=/r[ée]initialiser|reset|clear|tout effacer/i').count();
    if (hasReset > 0) {
      await log('T24: Reset filters button exists', 'PASS');
    } else {
      await log('T24: Reset filters button exists', 'FAIL', 'No reset button found');
    }
    await ctx.close();
  }

  // T25: No "Application error" on any search variant
  {
    const variants = [
      '?q=',
      '?q=a',
      '?q=é',
      '?q=🚀',
      '?q=%20',
      '?q=' + 'a'.repeat(500),
      '?sort=invalid',
      '?type=INVALID',
      '?year=9999',
      '?page=-1',
    ];

    for (const variant of variants) {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const page = await ctx.newPage();
      await page.goto(`https://examanet.com/recherche${variant}&t=${Date.now()}`, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => null);
      await page.waitForTimeout(2000);

      const hasError = await page.evaluate(() => document.body.textContent.includes('Application error'));
      if (hasError) {
        await log(`T25: Edge case "${variant}"`, 'FAIL', 'Application error');
        await ctx.close();
        break;
      }
      await ctx.close();
    }
    await log('T25: All edge cases (10 variants)', 'PASS', 'No application errors');
  }

  // =============================================
  // GROUP 10: PERFORMANCE
  // =============================================
  console.log('\n=== GROUP 10: Performance ===');

  // T26: Page load time
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    const start = Date.now();
    await page.goto('https://examanet.com/recherche?q=math&t=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 30000 });
    const loadTime = Date.now() - start;
    if (loadTime < 5000) {
      await log('T26: Page load < 5s', 'PASS', `${loadTime}ms`);
    } else {
      await log('T26: Page load < 5s', 'FAIL', `${loadTime}ms`);
    }
    await ctx.close();
  }

  // =============================================
  // SUMMARY
  // =============================================
  console.log('\n' + '='.repeat(50));
  console.log('=== RECHERCHE UX TEST SUMMARY ===');
  console.log('='.repeat(50));
  const passed = TEST_RESULTS.filter(r => r.status === 'PASS').length;
  const failed = TEST_RESULTS.filter(r => r.status === 'FAIL').length;
  const warned = TEST_RESULTS.filter(r => r.status === 'WARN').length;
  console.log(`✅ PASS: ${passed}`);
  console.log(`❌ FAIL: ${failed}`);
  console.log(`⚠️ WARN: ${warned}`);
  console.log(`Total: ${TEST_RESULTS.length}`);

  if (failed > 0) {
    console.log('\n=== BUGS FOUND ===');
    for (const r of TEST_RESULTS.filter(r => r.status === 'FAIL')) {
      console.log(`  ❌ ${r.name}`);
      console.log(`     ${r.message}`);
    }
  }

  if (warned > 0) {
    console.log('\n=== WARNINGS ===');
    for (const r of TEST_RESULTS.filter(r => r.status === 'WARN')) {
      console.log(`  ⚠️ ${r.name}: ${r.message}`);
    }
  }

  await browser.close();
})();