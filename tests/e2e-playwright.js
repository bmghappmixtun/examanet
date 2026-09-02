/**
 * Examanet E2E Test v3 — Final
 * 
 * Reliable test: tests visible content + direct API calls.
 * Avoids flaky regex extraction of internal Next.js data.
 */
const { chromium } = require('playwright');
const fs = require('fs');

const BASE = 'https://examanet-prod.examanet-poc.workers.dev';
const SCREENSHOT_DIR = '/tmp/audit/e2e-final';

const results = [];
let pass = 0, fail = 0;

function log(test, status, detail = '') {
  const symbol = status === 'PASS' ? '✅' : '❌';
  console.log(`  ${symbol} ${test}${detail ? ' — ' + detail : ''}`);
  results.push({ test, status, detail });
  if (status === 'PASS') pass++;
  else fail++;
}

async function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

async function gotoOk(page, url, timeout = 25000) {
  let lastErr;
  for (let i = 0; i < 3; i++) {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout });
      return true;
    } catch (e) {
      lastErr = e;
      await new Promise(r => setTimeout(r, 1000));
    }
  }
  throw lastErr;
}

(async () => {
  await ensureDir(SCREENSHOT_DIR);
  console.log('Starting browser...');
  const browser = await chromium.launch({
    headless: true,
    args: ['--ignore-certificate-errors', '--ignore-ssl-errors', '--disable-dev-shm-usage', '--no-sandbox']
  });

  try {
    const ctx = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      ignoreHTTPSErrors: true,
      userAgent: 'Mozilla/5.0 (E2E-v3) Examanet/1.0',
    });
    const page = await ctx.newPage();

    // ============================================================
    // SECTION 1: Public pages (simple, just load + check title)
    // ============================================================
    console.log('\n=== 1. Public pages ===');
    const publicTests = [
      { url: '/fr', name: 'Home FR' },
      { url: '/ar', name: 'Home AR' },
      { url: '/fr/ressources', name: 'Resources' },
      { url: '/fr/niveaux', name: 'Niveaux' },
      { url: '/fr/matieres', name: 'Matières' },
      { url: '/fr/professeurs', name: 'Professeurs' },
      { url: '/fr/bac/archives', name: 'BAC archives' },
      { url: '/fr/college', name: 'Collège' },
      { url: '/fr/concours-9eme-tunisie', name: 'Concours 9ème' },
      { url: '/fr/programme-officiel', name: 'Programme officiel' },
      { url: '/fr/a-propos', name: 'À propos' },
      { url: '/fr/faq', name: 'FAQ' },
      { url: '/fr/contact', name: 'Contact' },
      { url: '/fr/enseignants/rejoindre', name: 'Espace enseignants' },
    ];

    for (const { url, name } of publicTests) {
      try {
        const start = Date.now();
        await gotoOk(page, `${BASE}${url}`);
        await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
        const loadTime = Date.now() - start;
        const title = await page.title();
        const errorEl = await page.locator('h1:has-text("Page introuvable"), h1:has-text("Application error"), h1:has-text("Une erreur")').count();
        const hasContent = await page.locator('main, body > div').count() > 0;
        const shortName = url.replace(/[\/]/g, '_').replace(/^_/, '') || 'home';
        await page.screenshot({ path: `${SCREENSHOT_DIR}/${shortName}.png` }).catch(() => {});
        log(name, errorEl === 0 && hasContent ? 'PASS' : 'FAIL', `${loadTime}ms | title="${title.substring(0, 40)}"${errorEl ? ' [ERROR]' : ''}`);
      } catch (e) {
        log(name, 'FAIL', e.message.substring(0, 60));
      }
    }

    // ============================================================
    // SECTION 2: Auth pages (no locale prefix)
    // ============================================================
    console.log('\n=== 2. Auth pages ===');
    const authTests = [
      { url: '/connexion', name: 'Login', checkFields: true },
      { url: '/inscription', name: 'Signup' },
      { url: '/mot-de-passe-oublie', name: 'Forgot password' },
    ];

    for (const { url, name, checkFields } of authTests) {
      try {
        const start = Date.now();
        await gotoOk(page, `${BASE}${url}`);
        const loadTime = Date.now() - start;
        if (checkFields) {
          const hasEmail = await page.locator('input[type="email"]').count() > 0;
          const hasPassword = await page.locator('input[type="password"]').count() > 0;
          await page.screenshot({ path: `${SCREENSHOT_DIR}/login.png` });
          log(name, hasEmail && hasPassword ? 'PASS' : 'FAIL', `${loadTime}ms | email:${hasEmail} pwd:${hasPassword}`);
        } else {
          const errorEl = await page.locator('h1:has-text("Page introuvable")').count();
          const h1 = await page.locator('h1').first().textContent({ timeout: 3000 }).catch(() => '');
          log(name, errorEl === 0 ? 'PASS' : 'FAIL', `${loadTime}ms | h1="${h1?.substring(0, 40)}"`);
        }
      } catch (e) {
        log(name, 'FAIL', e.message.substring(0, 60));
      }
    }

    // ============================================================
    // SECTION 3: API endpoints (direct, fast, reliable)
    // ============================================================
    console.log('\n=== 3. API endpoints ===');
    const apiTests = [
      { url: '/api/health', name: 'Health', check: d => d.ok && d.db?.ok },
      { url: '/api/ressources-data', name: 'Ressources data', check: d => d.resources?.length > 0 },
      { url: '/api/professeurs/data', name: 'Professeurs data', check: d => d.teachers?.length > 0 },
      { url: '/api/search/suggest?q=math', name: 'Search suggest', check: d => d.results?.length > 0 },
      { url: '/api/search/resources?q=math&pageSize=5', name: 'Search resources', check: d => d.results?.length > 0 && d.total > 0 },
      { url: '/api/cron/monitor-alerts', name: 'Monitor alerts cron', check: d => d.ok !== undefined },
    ];

    for (const { url, name, check } of apiTests) {
      try {
        const start = Date.now();
        const resp = await page.request.get(`${BASE}${url}`);
        const loadTime = Date.now() - start;
        const ok = resp.status() === 200;
        if (ok) {
          const json = await resp.json();
          const dataOk = check ? check(json) : true;
          log(`API ${name}`, dataOk ? 'PASS' : 'FAIL', `${resp.status()} | ${loadTime}ms | ${JSON.stringify(json).length} bytes`);
        } else {
          log(`API ${name}`, 'FAIL', `${resp.status()} | ${loadTime}ms`);
        }
      } catch (e) {
        log(`API ${name}`, 'FAIL', e.message.substring(0, 60));
      }
    }

    // ============================================================
    // SECTION 4: Search page (visible content)
    // ============================================================
    console.log('\n=== 4. Search page ===');
    
    // 4.1 Search "math" - look for result cards
    try {
      const start = Date.now();
      await gotoOk(page, `${BASE}/fr/recherche?q=math`);
      await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
      const loadTime = Date.now() - start;
      // Count result cards (links to resources)
      const cards = await page.locator('a[href*="/fr/ressources/"]').count();
      // Look for the result count text
      const bodyText = await page.evaluate(() => document.body.innerText);
      const totalMatch = bodyText.match(/(\d+)\s*résultat/i);
      const total = totalMatch ? parseInt(totalMatch[1]) : 0;
      await page.screenshot({ path: `${SCREENSHOT_DIR}/search-math.png` });
      log('Search "math"', total > 0 ? 'PASS' : 'FAIL', `${loadTime}ms | ${total} résultats, ${cards} cards visible`);
    } catch (e) {
      log('Search "math"', 'FAIL', e.message.substring(0, 60));
    }

    // 4.2 Search "physique"
    try {
      const start = Date.now();
      await gotoOk(page, `${BASE}/fr/recherche?q=physique`);
      await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
      const loadTime = Date.now() - start;
      const bodyText = await page.evaluate(() => document.body.innerText);
      const totalMatch = bodyText.match(/(\d+)\s*résultat/i);
      const total = totalMatch ? parseInt(totalMatch[1]) : 0;
      log('Search "physique"', total > 0 ? 'PASS' : 'FAIL', `${loadTime}ms | ${total} résultats`);
    } catch (e) {
      log('Search "physique"', 'FAIL', e.message.substring(0, 60));
    }

    // 4.3 Search with subject filter
    try {
      const start = Date.now();
      await gotoOk(page, `${BASE}/fr/recherche?q=math&subject=mathematiques`);
      await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
      const loadTime = Date.now() - start;
      const cards = await page.locator('a[href*="/fr/ressources/"]').count();
      log('Search "math" + subject=mathematiques', cards > 0 ? 'PASS' : 'FAIL', `${loadTime}ms | ${cards} cards`);
    } catch (e) {
      log('Search filtered', 'FAIL', e.message.substring(0, 60));
    }

    // ============================================================
    // SECTION 5: Resource detail (use a known resource)
    // ============================================================
    console.log('\n=== 5. Resource detail ===');
    try {
      // Get a valid resource ID from API
      const resp = await page.request.get(`${BASE}/api/search/resources?q=math&pageSize=1`);
      const data = await resp.json();
      const firstId = data.results?.[0]?.numericId;
      
      if (firstId) {
        const start = Date.now();
        await gotoOk(page, `${BASE}/fr/ressources/${firstId}`);
        await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
        const loadTime = Date.now() - start;
        const h1 = await page.locator('h1').first().textContent({ timeout: 5000 });
        const finalUrl = page.url();
        await page.screenshot({ path: `${SCREENSHOT_DIR}/resource-detail.png` });
        log(`Resource detail (id=${firstId})`, h1 ? 'PASS' : 'FAIL', `${loadTime}ms | "${h1?.substring(0, 50)}"`);
      } else {
        log('Resource detail', 'FAIL', 'No resource ID from API');
      }
    } catch (e) {
      log('Resource detail', 'FAIL', e.message.substring(0, 60));
    }

    // ============================================================
    // SECTION 6: Navigation
    // ============================================================
    console.log('\n=== 6. Navigation ===');

    // 6.1 Home → Ressources via "Explorer"
    try {
      await gotoOk(page, `${BASE}/fr`);
      await page.waitForLoadState('networkidle', { timeout: 4000 }).catch(() => {});
      const exploreBtn = page.locator('a:has-text("Explorer les ressources")').first();
      if (await exploreBtn.count() > 0) {
        const href = await exploreBtn.getAttribute('href');
        await exploreBtn.click();
        await page.waitForURL(/\/fr\/ressources/, { timeout: 15000 });
        const newUrl = page.url();
        log('Click "Explorer les ressources"', newUrl.includes('/fr/ressources') ? 'PASS' : 'FAIL', `url=${newUrl.replace(BASE, '')}`);
      } else {
        log('Click Explorer', 'FAIL', 'No "Explorer les ressources" link found');
      }
    } catch (e) {
      log('Click Explorer', 'FAIL', e.message.substring(0, 60));
    }

    // 6.2 Niveaux → Collège
    try {
      await gotoOk(page, `${BASE}/fr/niveaux`);
      await page.waitForLoadState('networkidle', { timeout: 4000 }).catch(() => {});
      const collegeLink = page.locator('a[href="/fr/niveaux/college"]').first();
      if (await collegeLink.count() > 0) {
        await collegeLink.click();
        await page.waitForURL(/\/fr\/niveaux\/college/, { timeout: 15000 });
        log('Click Niveaux → Collège', 'PASS', `url=${page.url().replace(BASE, '')}`);
      } else {
        // Try alternative selector
        const allLinks = await page.locator('a[href*="/niveaux/"]').count();
        log('Click Niveaux → Collège', 'FAIL', `${allLinks} niveau links found but no /college`);
      }
    } catch (e) {
      log('Click Niveaux → Collège', 'FAIL', e.message.substring(0, 60));
    }

    // 6.3 Matières → Mathématiques
    try {
      await gotoOk(page, `${BASE}/fr/matieres`);
      await page.waitForLoadState('networkidle', { timeout: 4000 }).catch(() => {});
      const mathLink = page.locator('a[href*="mathematiques"]').first();
      if (await mathLink.count() > 0) {
        await mathLink.click();
        await page.waitForURL(/mathematiques/, { timeout: 15000 });
        log('Click Matières → Mathématiques', 'PASS', `url=${page.url().replace(BASE, '')}`);
      } else {
        log('Click Mathématiques', 'FAIL', 'No mathematiques link');
      }
    } catch (e) {
      log('Click Mathématiques', 'FAIL', e.message.substring(0, 60));
    }

    // ============================================================
    // SECTION 7: Mobile
    // ============================================================
    console.log('\n=== 7. Mobile ===');
    try {
      const mobileCtx = await browser.newContext({
        viewport: { width: 375, height: 667 },
        ignoreHTTPSErrors: true,
        userAgent: 'Mozilla/5.0 (iPhone) Mobile',
      });
      const mPage = await mobileCtx.newPage();
      const start = Date.now();
      await gotoOk(mPage, `${BASE}/fr`);
      await mPage.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
      const loadTime = Date.now() - start;
      const h1 = await mPage.locator('h1').first().textContent({ timeout: 5000 });
      await mPage.screenshot({ path: `${SCREENSHOT_DIR}/mobile-home.png` });
      log('Mobile home (375px)', h1 ? 'PASS' : 'FAIL', `${loadTime}ms | h1="${h1?.substring(0, 30)}"`);
      
      // Mobile menu
      await mPage.goto(`${BASE}/fr/ressources`, { waitUntil: 'domcontentloaded' });
      const burgerBtn = await mPage.locator('button[aria-label*="menu" i], button[aria-label*="ouvrir" i]').count();
      log('Mobile menu button', burgerBtn > 0 ? 'PASS' : 'FAIL', `${burgerBtn} menu buttons`);
      
      await mobileCtx.close();
    } catch (e) {
      log('Mobile tests', 'FAIL', e.message.substring(0, 60));
    }

    await ctx.close();

  } finally {
    await browser.close();
  }

  console.log('\n' + '='.repeat(60));
  console.log(`FINAL SUMMARY: ${pass} PASS | ${fail} FAIL`);
  console.log('='.repeat(60));
  
  if (fail > 0) {
    console.log('\nFailures:');
    results.filter(r => r.status === 'FAIL').forEach(r => {
      console.log(`  ❌ ${r.test}: ${r.detail}`);
    });
  }
  
  console.log(`\nScreenshots: ${SCREENSHOT_DIR}/`);
  process.exit(fail > 0 ? 1 : 0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(2); });
