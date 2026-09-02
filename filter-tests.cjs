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
  // GROUP A: Filter via URL (paste in browser)
  // =============================================
  console.log('\n=== GROUP A: Filter via URL ===');

  // T-A1: Type filter
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    await page.goto('https://examanet.com/recherche?type=DEVOIR&t=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);
    
    const hasError = await page.evaluate(() => document.body.textContent.includes('Application error'));
    const count = await page.evaluate(() => {
      const m = document.body.textContent.match(/(\d+(?:\.\d+)?k?)\s+(ressources?)/);
      return m ? m[1] : null;
    });
    const urlType = await page.evaluate(() => new URL(window.location.href).searchParams.get('type'));
    
    if (!hasError && count) {
      await log('A1: URL type=DEVOIR', 'PASS', `${count} results, type=${urlType}`);
    } else {
      await log('A1: URL type=DEVOIR', 'FAIL', `error=${hasError}, count=${count}`);
    }
    await ctx.close();
  }

  // T-A2: Subject filter via URL
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    await page.goto('https://examanet.com/recherche?subject=cmqi8nr2z00252n4aoa8vuwmy&t=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);
    
    const hasError = await page.evaluate(() => document.body.textContent.includes('Application error'));
    const count = await page.evaluate(() => {
      const m = document.body.textContent.match(/(\d+(?:\.\d+)?k?)\s+(ressources?)/);
      return m ? m[1] : null;
    });
    
    if (!hasError && count) {
      await log('A2: URL subject=math ID', 'PASS', `${count} results`);
    } else {
      await log('A2: URL subject=math ID', 'FAIL', `error=${hasError}, count=${count}`);
    }
    await ctx.close();
  }

  // T-A3: Combined filter via URL
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    await page.goto('https://examanet.com/recherche?type=DEVOIR&year=2024&t=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);
    
    const hasError = await page.evaluate(() => document.body.textContent.includes('Application error'));
    const count = await page.evaluate(() => {
      const m = document.body.textContent.match(/(\d+(?:\.\d+)?k?)\s+(ressources?)/);
      return m ? m[1] : null;
    });
    
    if (!hasError && count) {
      await log('A3: URL type=DEVOIR&year=2024', 'PASS', `${count} results`);
    } else {
      await log('A3: URL type=DEVOIR&year=2024', 'FAIL', `error=${hasError}, count=${count}`);
    }
    await ctx.close();
  }

  // =============================================
  // GROUP B: Click on filter buttons (UI interaction)
  // =============================================
  console.log('\n=== GROUP B: Click filter buttons ===');

  // T-B1: Click "Cours" type filter
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    await page.goto('https://examanet.com/recherche?t=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);
    
    // Find the "Cours" button
    const coursBtn = page.locator('button:has-text("Cours")').first();
    const count = await coursBtn.count();
    
    if (count > 0) {
      const href = await coursBtn.evaluate(el => el.closest('a')?.href || el.getAttribute('data-href') || 'no-href');
      console.log(`  Cours button found, context: ${href.substring(0, 100)}`);
      
      await coursBtn.click();
      await page.waitForTimeout(3000);
      
      const newUrl = page.url();
      const newCount = await page.evaluate(() => {
        const m = document.body.textContent.match(/(\d+(?:\.\d+)?k?)\s+(ressources?)/);
        return m ? m[1] : null;
      });
      
      if (newUrl.includes('type=COURSE') || newUrl.includes('type=Cours')) {
        await log('B1: Click Cours filter navigates', 'PASS', `${newUrl.substring(0, 100)} → ${newCount}`);
      } else {
        await log('B1: Click Cours filter navigates', 'FAIL', `URL: ${newUrl}`);
      }
    } else {
      await log('B1: Click Cours filter navigates', 'FAIL', 'No Cours button found');
    }
    await ctx.close();
  }

  // T-B2: Click "Mathématiques" subject filter
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    await page.goto('https://examanet.com/recherche?t=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);
    
    // Find Mathématiques in sidebar (not in mobile filter)
    const mathBtn = page.locator('aside button:has-text("Mathématiques")').first();
    const count = await mathBtn.count();
    
    if (count > 0) {
      await mathBtn.click();
      await page.waitForTimeout(3000);
      
      const newUrl = page.url();
      const newCount = await page.evaluate(() => {
        const m = document.body.textContent.match(/(\d+(?:\.\d+)?k?)\s+(ressources?)/);
        return m ? m[1] : null;
      });
      
      if (newUrl.includes('subject=') || newUrl.includes('matieres')) {
        await log('B2: Click Mathématiques filter', 'PASS', `${newUrl.substring(0, 100)} → ${newCount}`);
      } else {
        await log('B2: Click Mathématiques filter', 'FAIL', `URL: ${newUrl}`);
      }
    } else {
      await log('B2: Click Mathématiques filter', 'WARN', 'No Mathématiques button in sidebar');
    }
    await ctx.close();
  }

  // T-B3: Click "7ème année" class filter
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    await page.goto('https://examanet.com/recherche?t=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);
    
    const classBtn = page.locator('aside button:has-text("7ème année")').first();
    const count = await classBtn.count();
    
    if (count > 0) {
      await classBtn.click();
      await page.waitForTimeout(3000);
      
      const newUrl = page.url();
      const newCount = await page.evaluate(() => {
        const m = document.body.textContent.match(/(\d+(?:\.\d+)?k?)\s+(ressources?)/);
        return m ? m[1] : null;
      });
      
      if (newUrl.includes('class=')) {
        await log('B3: Click 7ème filter', 'PASS', `${newUrl.substring(0, 100)} → ${newCount}`);
      } else {
        await log('B3: Click 7ème filter', 'FAIL', `URL: ${newUrl}`);
      }
    } else {
      await log('B3: Click 7ème filter', 'WARN', 'No 7ème button in sidebar');
    }
    await ctx.close();
  }

  // T-B4: Click "Tout effacer" reset
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    await page.goto('https://examanet.com/recherche?type=DEVOIR&t=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);
    
    const resetBtn = page.locator('button:has-text("Tout effacer")').first();
    const resetLink = page.locator('a:has-text("Tout effacer")').first();
    const btnCount = await resetBtn.count();
    const linkCount = await resetLink.count();
    
    if (btnCount > 0 || linkCount > 0) {
      const el = btnCount > 0 ? resetBtn : resetLink;
      await el.click();
      await page.waitForTimeout(3000);
      
      const newUrl = page.url();
      if (!newUrl.includes('type=')) {
        await log('B4: Click reset clears filters', 'PASS', `URL: ${newUrl}`);
      } else {
        await log('B4: Click reset clears filters', 'FAIL', `URL still has filters: ${newUrl}`);
      }
    } else {
      await log('B4: Click reset clears filters', 'FAIL', 'No reset button/link found');
    }
    await ctx.close();
  }

  // T-B5: Click year filter (e.g., "2024")
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    await page.goto('https://examanet.com/recherche?t=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);
    
    // Find 2024 (not 2024-2025) in sidebar
    const yearBtn = page.locator('aside button').filter({ hasText: /^2024$/ }).first();
    const count = await yearBtn.count();
    
    if (count > 0) {
      await yearBtn.click();
      await page.waitForTimeout(3000);
      
      const newUrl = page.url();
      const newCount = await page.evaluate(() => {
        const m = document.body.textContent.match(/(\d+(?:\.\d+)?k?)\s+(ressources?)/);
        return m ? m[1] : null;
      });
      
      if (newUrl.includes('year=')) {
        await log('B5: Click year=2024 filter', 'PASS', `${newUrl.substring(0, 100)} → ${newCount}`);
      } else {
        await log('B5: Click year=2024 filter', 'FAIL', `URL: ${newUrl}`);
      }
    } else {
      await log('B5: Click year=2024 filter', 'WARN', 'No year=2024 button (might only show 2024-2025)');
    }
    await ctx.close();
  }

  // =============================================
  // GROUP C: Multiple filters combined
  // =============================================
  console.log('\n=== GROUP C: Multiple filters combined ===');

  // T-C1: Click 2 filters in sequence
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    await page.goto('https://examanet.com/recherche?t=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);
    
    // Click Cours first
    const coursBtn = page.locator('aside button:has-text("Cours")').first();
    await coursBtn.click();
    await page.waitForTimeout(2000);
    
    // Then click Mathématiques
    const mathBtn = page.locator('aside button:has-text("Mathématiques")').first();
    const mathCount = await mathBtn.count();
    
    if (mathCount > 0) {
      await mathBtn.click();
      await page.waitForTimeout(3000);
      
      const newUrl = page.url();
      const hasType = newUrl.includes('type=');
      const hasSubject = newUrl.includes('subject=');
      const newCount = await page.evaluate(() => {
        const m = document.body.textContent.match(/(\d+(?:\.\d+)?k?)\s+(ressources?)/);
        return m ? m[1] : null;
      });
      
      if (hasType && hasSubject) {
        await log('C1: Click 2 filters (Cours + Math)', 'PASS', `${newCount} results, both filters in URL`);
      } else {
        await log('C1: Click 2 filters (Cours + Math)', 'FAIL', `URL: ${newUrl} (type=${hasType}, subject=${hasSubject})`);
      }
    } else {
      await log('C1: Click 2 filters (Cours + Math)', 'FAIL', 'Mathématiques button not found after Cours click');
    }
    await ctx.close();
  }

  // =============================================
  // GROUP D: Sort dropdown
  // =============================================
  console.log('\n=== GROUP D: Sort dropdown ===');

  // T-D1: Change sort to "Plus récent"
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    await page.goto('https://examanet.com/recherche?q=math&t=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);
    
    const sortSelect = page.locator('select').first();
    const count = await sortSelect.count();
    
    if (count > 0) {
      const options = await sortSelect.evaluate(el => Array.from(el.options).map(o => ({ value: o.value, text: o.textContent })));
      console.log(`  Sort options: ${JSON.stringify(options)}`);
      
      // Select "Plus récent"
      await sortSelect.selectOption('recent');
      await page.waitForTimeout(3000);
      
      const newUrl = page.url();
      const newCount = await page.evaluate(() => {
        const m = document.body.textContent.match(/(\d+(?:\.\d+)?k?)\s+(ressources?)/);
        return m ? m[1] : null;
      });
      
      if (newUrl.includes('sort=recent')) {
        await log('D1: Change sort to recent', 'PASS', `${newCount} results, sort=recent in URL`);
      } else {
        await log('D1: Change sort to recent', 'FAIL', `URL: ${newUrl}`);
      }
    } else {
      await log('D1: Change sort to recent', 'FAIL', 'No select element found');
    }
    await ctx.close();
  }

  // =============================================
  // GROUP E: View toggle (grid vs list)
  // =============================================
  console.log('\n=== GROUP E: View toggle ===');

  // T-E1: Toggle to list view
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    await page.goto('https://examanet.com/recherche?t=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);
    
    const listBtn = page.locator('button[title="Liste"]');
    const count = await listBtn.count();
    
    if (count > 0) {
      await listBtn.click();
      await page.waitForTimeout(2000);
      
      const isActive = await listBtn.evaluate(el => el.className.includes('bg-primary'));
      if (isActive) {
        await log('E1: Toggle to list view', 'PASS', 'List view active');
      } else {
        await log('E1: Toggle to list view', 'WARN', 'Button clicked but active state unclear');
      }
    } else {
      await log('E1: Toggle to list view', 'FAIL', 'No list button found');
    }
    await ctx.close();
  }

  // =============================================
  // GROUP F: Filter UI shows active state
  // =============================================
  console.log('\n=== GROUP F: Filter UI active state ===');

  // T-F1: Active filter is highlighted
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    await page.goto('https://examanet.com/recherche?type=DEVOIR&t=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);
    
    // Find Devoir button and check if it's active
    const devoirBtn = page.locator('aside button:has-text("Devoir")').first();
    const isActive = await devoirBtn.evaluate(el => el.className.includes('bg-primary') || el.className.includes('text-primary'));
    
    if (isActive) {
      await log('F1: Active filter highlighted', 'PASS', 'Devoir has primary bg');
    } else {
      const className = await devoirBtn.evaluate(el => el.className);
      await log('F1: Active filter highlighted', 'FAIL', `No active state. Class: ${className.substring(0, 100)}`);
    }
    await ctx.close();
  }

  // =============================================
  // SUMMARY
  // =============================================
  console.log('\n' + '='.repeat(50));
  console.log('=== FILTER TESTS SUMMARY ===');
  console.log('='.repeat(50));
  const passed = TEST_RESULTS.filter(r => r.status === 'PASS').length;
  const failed = TEST_RESULTS.filter(r => r.status === 'FAIL').length;
  const warned = TEST_RESULTS.filter(r => r.status === 'WARN').length;
  console.log(`✅ PASS: ${passed}`);
  console.log(`❌ FAIL: ${failed}`);
  console.log(`⚠️ WARN: ${warned}`);
  console.log(`Total: ${TEST_RESULTS.length}`);

  if (failed > 0) {
    console.log('\n=== BUGS ===');
    for (const r of TEST_RESULTS.filter(r => r.status === 'FAIL')) {
      console.log(`  ❌ ${r.name}: ${r.message}`);
    }
  }

  await browser.close();
})();
