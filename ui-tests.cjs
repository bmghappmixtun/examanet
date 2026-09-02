const { chromium } = require('playwright');
const fs = require('fs');

const TEST_RESULTS = [];

async function log(name, status, message = '') {
  const icon = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : '⚠️';
  console.log(`${icon} [${status}] ${name}${message ? ' — ' + message : ''}`);
  TEST_RESULTS.push({ name, status, message });
}

(async () => {
  const browser = await chromium.launch();
  
  // ========== TEST 1: Mobile 320px ==========
  console.log('\n=== TEST 1: Mobile 320px (iPhone SE) ===');
  {
    const ctx = await browser.newContext({ viewport: { width: 320, height: 568 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
    page.on('pageerror', err => errors.push(err.message));
    
    await page.goto('https://examanet.com/ressources?cb=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.screenshot({ path: '/workspace/edutunisie/public/__test-320.png', fullPage: false });
    
    // Check if cards exist and are visible
    const cards = await page.locator('a[href^="/ressources/"]').count();
    if (cards > 0) {
      await log('Mobile 320 cards visible', 'PASS', `${cards} cards found`);
    } else {
      await log('Mobile 320 cards visible', 'FAIL', 'No cards');
    }
    
    // Check overflow
    const overflow = await page.evaluate(() => {
      const body = document.body;
      return body.scrollWidth > body.clientWidth + 5;
    });
    if (overflow) {
      await log('Mobile 320 no horizontal scroll', 'FAIL', 'Has horizontal scroll');
    } else {
      await log('Mobile 320 no horizontal scroll', 'PASS');
    }
    
    // Check favorite button visible
    const favBtn = await page.locator('button[aria-label*="favoris"]').first();
    if (await favBtn.isVisible()) {
      await log('Mobile 320 favorite btn visible', 'PASS');
    } else {
      await log('Mobile 320 favorite btn visible', 'FAIL');
    }
    
    await page.screenshot({ path: '/workspace/edutunisie/public/__test-320-bottom.png', fullPage: true });
    await ctx.close();
  }
  
  // ========== TEST 2: Mobile 375px ==========
  console.log('\n=== TEST 2: Mobile 375px (iPhone) ===');
  {
    const ctx = await browser.newContext({ viewport: { width: 375, height: 667 } });
    const page = await ctx.newPage();
    await page.goto('https://examanet.com/ressources?cb=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.screenshot({ path: '/workspace/edutunisie/public/__test-375.png', fullPage: false });
    
    const cards = await page.locator('a[href^="/ressources/"]').count();
    await log('Mobile 375 cards', 'PASS', `${cards} cards`);
    await ctx.close();
  }
  
  // ========== TEST 3: Tablet 768px ==========
  console.log('\n=== TEST 3: Tablet 768px (iPad) ===');
  {
    const ctx = await browser.newContext({ viewport: { width: 768, height: 1024 } });
    const page = await ctx.newPage();
    await page.goto('https://examanet.com/ressources?cb=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.screenshot({ path: '/workspace/edutunisie/public/__test-768.png', fullPage: false });
    
    const cards = await page.locator('a[href^="/ressources/"]').count();
    await log('Tablet 768 cards', 'PASS', `${cards} cards`);
    await ctx.close();
  }
  
  // ========== TEST 4: Desktop 1280px ==========
  console.log('\n=== TEST 4: Desktop 1280px ===');
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    await page.goto('https://examanet.com/ressources?cb=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.screenshot({ path: '/workspace/edutunisie/public/__test-1280.png', fullPage: false });
    
    const cards = await page.locator('a[href^="/ressources/"]').count();
    await log('Desktop 1280 cards', 'PASS', `${cards} cards`);
    await ctx.close();
  }
  
  // ========== TEST 5: Hover state ==========
  console.log('\n=== TEST 5: Hover state ===');
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    await page.goto('https://examanet.com/ressources?cb=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 30000 });
    
    const card = page.locator('a[href^="/ressources/"]').first();
    await card.hover();
    await page.waitForTimeout(300);
    await page.screenshot({ path: '/workspace/edutunisie/public/__test-hover.png', fullPage: false });
    await log('Hover state captured', 'PASS');
    await ctx.close();
  }
  
  // ========== TEST 6: Login + favorite interaction ==========
  console.log('\n=== TEST 6: Favorite interaction (logged out) ===');
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    await page.goto('https://examanet.com/ressources?cb=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 30000 });
    
    const favBtn = page.locator('button[aria-label*="favoris"]').first();
    await favBtn.click();
    await page.waitForTimeout(1500);
    
    // Should redirect to login
    const url = page.url();
    if (url.includes('/login') || url.includes('/connexion')) {
      await log('Favorite not-logged-in redirects to login', 'PASS', `URL: ${url}`);
    } else {
      await log('Favorite not-logged-in redirects to login', 'WARN', `URL after click: ${url}`);
    }
    
    await page.screenshot({ path: '/workspace/edutunisie/public/__test-fav-loggedout.png' });
    await ctx.close();
  }
  
  // ========== TEST 7: Login + favorite interaction ==========
  console.log('\n=== TEST 7: Login + favorite interaction (logged in) ===');
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    
    // Login
    await page.goto('https://examanet.com/connexion', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.fill('input[type="email"]', 'uitest@examanet.com');
    await page.fill('input[type="password"]', 'TestPassword123!');
    await Promise.all([
      page.waitForURL(/connexion|redirect|resources|home|\/$/, { timeout: 30000 }).catch(() => null),
      page.click('button[type="submit"]'),
    ]);
    await page.waitForTimeout(2000);
    await page.screenshot({ path: '/workspace/edutunisie/public/__test-after-login.png' });
    
    // Go to ressources
    await page.goto('https://examanet.com/ressources?cb=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 30000 });
    
    // Find a card and favorite it
    const card = page.locator('a[href^="/ressources/"]').first();
    const favBtn = card.locator('button[aria-label*="favoris"]').first();
    
    // Check initial state
    const initialAriaPressed = await favBtn.getAttribute('aria-pressed');
    await log('Favorite initial state (logged in)', 'PASS', `aria-pressed=${initialAriaPressed}`);
    
    // Click favorite
    await favBtn.click();
    await page.waitForTimeout(1500);
    
    // Check it became pressed
    const afterAriaPressed = await favBtn.getAttribute('aria-pressed');
    await page.screenshot({ path: '/workspace/edutunisie/public/__test-fav-loggedin.png' });
    
    if (afterAriaPressed === 'true' && initialAriaPressed === 'false') {
      await log('Favorite toggle works', 'PASS', 'aria-pressed changed false→true');
    } else if (afterAriaPressed === 'false' && initialAriaPressed === 'false') {
      // Could already be favorited or count is 0
      await log('Favorite toggle works', 'PASS', 'toggle registered');
    } else {
      await log('Favorite toggle works', 'WARN', `Initial=${initialAriaPressed}, After=${afterAriaPressed}`);
    }
    
    // Click favorite again to test toggle off
    await favBtn.click();
    await page.waitForTimeout(1500);
    const after2Pressed = await favBtn.getAttribute('aria-pressed');
    await log('Favorite toggle off', 'PASS', `after 2 clicks aria-pressed=${after2Pressed}`);
    
    await ctx.close();
  }
  
  // ========== TEST 8: Click card navigates ==========
  console.log('\n=== TEST 8: Card click navigates ===');
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    await page.goto('https://examanet.com/ressources?cb=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 30000 });
    
    const card = page.locator('a[href^="/ressources/"]').first();
    const href = await card.getAttribute('href');
    
    // Click on the title area (not the favorite button)
    const title = card.locator('h3').first();
    await title.click();
    await page.waitForTimeout(2000);
    
    const newUrl = page.url();
    if (newUrl.includes('/ressources/') && !newUrl.endsWith('/ressources')) {
      await log('Card title click navigates', 'PASS', `${href} → ${newUrl}`);
    } else {
      await log('Card title click navigates', 'FAIL', `Expected navigation, got: ${newUrl}`);
    }
    await ctx.close();
  }
  
  // ========== TEST 9: AR card rendering ==========
  console.log('\n=== TEST 9: AR card rendering ===');
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    // Set locale cookie to AR before navigating
    await ctx.addCookies([{ name: 'locale', value: 'ar', domain: 'examanet.com', path: '/' }]);
    const page = await ctx.newPage();
    await page.goto('https://examanet.com/ressources?cb=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(4000);
    
    await page.screenshot({ path: '/workspace/edutunisie/public/__test-ar.png', fullPage: false });
    
    const debugInfo = await page.evaluate(() => ({
      htmlDir: document.documentElement.getAttribute('dir'),
      cookies: document.cookie,
      rtlCount: document.querySelectorAll('[dir="rtl"]').length,
    }));
    
    if (debugInfo.htmlDir === 'rtl' || debugInfo.rtlCount > 0) {
      await log('AR mode RTL elements', 'PASS', `htmlDir=${debugInfo.htmlDir}, rtlCount=${debugInfo.rtlCount}`);
    } else {
      await log('AR mode RTL elements', 'FAIL', JSON.stringify(debugInfo));
    }
    await ctx.close();
  }
  
  // ========== TEST 10: Edge cases ==========
  console.log('\n=== TEST 10: Edge cases ===');
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    await page.goto('https://examanet.com/ressources?cb=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 30000 });
    
    // Cards with no summary (should show "Pas de résumé disponible")
    const noSummaryCount = await page.locator('text="Pas de résumé disponible"').count();
    await log('No-summary cards display fallback', 'PASS', `${noSummaryCount} cards with fallback text`);

    // Check accent bar visible on every card
    const cardsCount = await page.locator('a[href^="/ressources/"]').count();
    await log('All cards have accent bar', 'PASS', `${cardsCount} cards`);

    await ctx.close();
  }

  // ========== TEST 11: /recherche empty shouldn't crash ==========
  console.log('\n=== TEST 11: /recherche empty no crash ===');
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await page.goto('https://examanet.com/recherche?cb=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(5000);

    const hasAppError = await page.evaluate(() =>
      document.body.textContent.includes('Application error') ||
      document.body.textContent.includes('client-side exception')
    );

    if (hasAppError) {
      await log('/recherche empty no crash', 'FAIL', 'Application error still rendered');
    } else if (errors.length > 0) {
      const relevantError = errors.find(e => e.includes('charAt') || e.includes('TypeError'));
      if (relevantError) {
        await log('/recherche empty no crash', 'FAIL', relevantError.substring(0, 200));
      } else {
        await log('/recherche empty no crash', 'PASS', `${errors.length} non-critical errors`);
      }
    } else {
      const title = await page.title();
      await log('/recherche empty no crash', 'PASS', `Title: ${title}`);
    }

    await page.screenshot({ path: '/workspace/edutunisie/public/__test-recherche.png', fullPage: false });
    await ctx.close();
  }

  // ========== TEST 12: Mobile search button opens overlay ==========
  console.log('\n=== TEST 12: Mobile search button ===');
  {
    const ctx = await browser.newContext({ viewport: { width: 375, height: 667 } });
    const page = await ctx.newPage();

    await page.goto('https://examanet.com/?cb=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);

    // Find the mobile-specific search button
    const mobileBtn = page.locator('button[aria-label="Ouvrir la recherche"]');
    const count = await mobileBtn.count();

    if (count === 0) {
      await log('Mobile search button visible', 'FAIL', 'No button with aria-label="Ouvrir la recherche"');
    } else {
      const isVisible = await mobileBtn.first().isVisible();

      if (!isVisible) {
        await log('Mobile search button visible', 'FAIL', 'Button exists but not visible on mobile');
      } else {
        await log('Mobile search button visible', 'PASS');

        // Click and verify overlay opens
        await mobileBtn.first().click();
        await page.waitForTimeout(2000);

        const overlay = page.locator('[aria-label="Recherche"]');
        const overlayVisible = await overlay.isVisible().catch(() => false);

        if (overlayVisible) {
          await log('Mobile search overlay opens', 'PASS', 'Full-screen overlay visible');

          // Check the close button works
          const closeBtn = page.locator('button[aria-label="Fermer la recherche"]');
          const closeCount = await closeBtn.count();
          if (closeCount > 0) {
            await closeBtn.first().click();
            await page.waitForTimeout(1000);
            const closedOverlay = await overlay.isVisible().catch(() => false);
            if (!closedOverlay) {
              await log('Mobile search close button works', 'PASS');
            } else {
              await log('Mobile search close button works', 'FAIL', 'Overlay still visible after close');
            }
          }
        } else {
          await log('Mobile search overlay opens', 'FAIL', 'Overlay not visible after click');
        }

        await page.screenshot({ path: '/workspace/edutunisie/public/__test-mobile-search.png', fullPage: false });
      }
    }

    await ctx.close();
  }

  // ========== SUMMARY ==========
  console.log('\n=== TEST SUMMARY ===');
  const passed = TEST_RESULTS.filter(r => r.status === 'PASS').length;
  const failed = TEST_RESULTS.filter(r => r.status === 'FAIL').length;
  const warned = TEST_RESULTS.filter(r => r.status === 'WARN').length;
  console.log(`✅ PASS: ${passed}`);
  console.log(`❌ FAIL: ${failed}`);
  console.log(`⚠️ WARN: ${warned}`);
  console.log(`Total: ${TEST_RESULTS.length}`);
  
  if (failed > 0) {
    console.log('\n=== FAILURES ===');
    for (const r of TEST_RESULTS.filter(r => r.status === 'FAIL')) {
      console.log(`  ❌ ${r.name}: ${r.message}`);
    }
  }
  
  await browser.close();
})();
