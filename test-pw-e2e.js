/**
 * Examanet E2E Test v2 — Phase 8 validation
 * 
 * Fixed expectations:
 * - Auth pages: /connexion, /inscription (NO locale prefix)
 * - /ar works (Arabic content), but html attrs sync client-side
 * - /api/search/suggest returns {results: [{type, ...}]}
 * - Search page: data in initialData.total
 * - "Explorer" button uses NextLink with locale routing
 */
const { chromium } = require('playwright');
const fs = require('fs');

const BASE = 'https://examanet-prod.examanet-poc.workers.dev';
const SCREENSHOT_DIR = '/tmp/audit/e2e-v2';

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

async function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, rej) => setTimeout(() => rej(new Error(`Timeout: ${label} (${ms}ms)`)), ms))
  ]);
}

(async () => {
  await ensureDir(SCREENSHOT_DIR);
  console.log('Starting browser...');
  const browser = await chromium.launch({
    headless: true,
    args: ['--ignore-certificate-errors', '--ignore-ssl-errors', '--disable-dev-shm-usage', '--no-sandbox']
  });

  try {
    // Single context for most tests
    const ctx = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      ignoreHTTPSErrors: true,
      userAgent: 'Mozilla/5.0 (E2E-v2) Examanet/1.0',
      locale: 'fr-FR',
    });
    const page = await ctx.newPage();

    // ============================================================
    // 1. PUBLIC PAGES
    // ============================================================
    console.log('\n=== 1. Public pages ===');
    
    const publicTests = [
      { url: '/fr', name: 'Home /fr' },
      { url: '/ar', name: 'Home /ar' },
      { url: '/fr/ressources', name: 'Resources list' },
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
        await withTimeout(
          page.goto(`${BASE}${url}`, { waitUntil: 'domcontentloaded' }),
          25000, name
        );
        await page.waitForLoadState('networkidle', { timeout: 6000 }).catch(() => {});
        const loadTime = Date.now() - start;
        const title = await page.title();
        const ok = title.includes('Examanet') || title.includes('examanet') || title.length > 0;
        // Check for error
        const errorEl = await page.locator('h1:has-text("Page introuvable"), h1:has-text("Application error")').count();
        const realError = errorEl > 0;
        const shortName = url.split('/').slice(-1)[0] || 'home';
        await page.screenshot({ path: `${SCREENSHOT_DIR}/${shortName}.png` }).catch(() => {});
        log(name, ok && !realError ? 'PASS' : 'FAIL', `${loadTime}ms | title="${title.substring(0, 40)}"${realError ? ' [ERROR PAGE]' : ''}`);
      } catch (e) {
        log(name, 'FAIL', e.message.substring(0, 60));
      }
    }

    // ============================================================
    // 2. AUTH PAGES (no locale prefix)
    // ============================================================
    console.log('\n=== 2. Auth pages (no locale) ===');
    
    const authTests = [
      { url: '/connexion', name: 'Login /connexion', checkFields: true },
      { url: '/inscription', name: 'Signup /inscription' },
      { url: '/mot-de-passe-oublie', name: 'Forgot password' },
    ];

    for (const { url, name, checkFields } of authTests) {
      try {
        const start = Date.now();
        await withTimeout(
          page.goto(`${BASE}${url}`, { waitUntil: 'domcontentloaded' }),
          20000, name
        );
        const loadTime = Date.now() - start;
        if (checkFields) {
          const hasEmail = await page.locator('input[type="email"]').count() > 0;
          const hasPassword = await page.locator('input[type="password"]').count() > 0;
          await page.screenshot({ path: `${SCREENSHOT_DIR}/login.png` });
          log(name, hasEmail && hasPassword ? 'PASS' : 'FAIL', `${loadTime}ms | email:${hasEmail} password:${hasPassword}`);
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
    // 3. SEARCH
    // ============================================================
    console.log('\n=== 3. Search ===');

    // 3.1 Search page with result count
    try {
      const start = Date.now();
      await page.goto(`${BASE}/fr/recherche?q=math`, { waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('networkidle', { timeout: 6000 }).catch(() => {});
      const loadTime = Date.now() - start;
      // Get the result count from initialData
      const total = await page.evaluate(() => {
        // The data is in __next_f
        const scripts = document.querySelectorAll('script');
        for (const s of scripts) {
          const text = s.textContent || '';
          const m = text.match(/"initialData":\{[^}]*"total":(\d+)/);
          if (m) return parseInt(m[1]);
        }
        return 0;
      });
      const cards = await page.locator('a[href*="/fr/ressources/"]').count();
      log('Search /fr/recherche?q=math', total > 0 ? 'PASS' : 'FAIL', `${loadTime}ms | total=${total}, cards=${cards}`);
    } catch (e) {
      log('Search math', 'FAIL', e.message.substring(0, 60));
    }

    // 3.2 Search with different query
    try {
      const start = Date.now();
      await page.goto(`${BASE}/fr/recherche?q=physique`, { waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('networkidle', { timeout: 6000 }).catch(() => {});
      const loadTime = Date.now() - start;
      const total = await page.evaluate(() => {
        const scripts = document.querySelectorAll('script');
        for (const s of scripts) {
          const text = s.textContent || '';
          const m = text.match(/"initialData":\{[^}]*"total":(\d+)/);
          if (m) return parseInt(m[1]);
        }
        return 0;
      });
      log('Search "physique"', total > 0 ? 'PASS' : 'FAIL', `${loadTime}ms | total=${total}`);
    } catch (e) {
      log('Search physique', 'FAIL', e.message.substring(0, 60));
    }

    // 3.3 API suggest
    try {
      const start = Date.now();
      const resp = await page.request.get(`${BASE}/api/search/suggest?q=math`);
      const loadTime = Date.now() - start;
      const json = await resp.json();
      const count = json.results?.length || 0;
      log('API /api/search/suggest', resp.status() === 200 && count > 0 ? 'PASS' : 'FAIL', `${resp.status()} | ${loadTime}ms | ${count} results`);
    } catch (e) {
      log('API suggest', 'FAIL', e.message.substring(0, 60));
    }

    // ============================================================
    // 4. RESOURCE DETAIL
    // ============================================================
    console.log('\n=== 4. Resource detail ===');

    try {
      const start = Date.now();
      // First find a valid resource id
      const resp = await page.request.get(`${BASE}/api/search/resources?q=math&pageSize=1`);
      const data = await resp.json();
      const firstId = data.resources?.[0]?.numericId || data.resources?.[0]?.id;
      
      if (firstId) {
        await page.goto(`${BASE}/fr/ressources/${firstId}`, { waitUntil: 'domcontentloaded' });
        await page.waitForLoadState('networkidle', { timeout: 6000 }).catch(() => {});
        const loadTime = Date.now() - start;
        const h1 = await page.locator('h1').first().textContent({ timeout: 5000 });
        const finalUrl = page.url();
        log(`Resource detail (id=${firstId})`, h1 ? 'PASS' : 'FAIL', `${loadTime}ms | "${h1?.substring(0, 50)}" | final=${finalUrl.replace(BASE, '')}`);
      } else {
        log('Resource detail', 'FAIL', 'No resource ID found');
      }
    } catch (e) {
      log('Resource detail', 'FAIL', e.message.substring(0, 60));
    }

    // ============================================================
    // 5. NAVIGATION FLOW
    // ============================================================
    console.log('\n=== 5. Navigation flow ===');

    // 5.1 Click "Explorer" button on home → goes to /fr/ressources
    try {
      await page.goto(`${BASE}/fr`, { waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
      const exploreBtn = page.locator('a:has-text("Explorer")').first();
      const count = await exploreBtn.count();
      if (count > 0) {
        const href = await exploreBtn.getAttribute('href');
        log('"Explorer" link href', href ? 'PASS' : 'FAIL', `href=${href}`);
        if (href) {
          await exploreBtn.click();
          await page.waitForLoadState('domcontentloaded', { timeout: 15000 });
          const newUrl = page.url();
          log('Click Explorer → navigates', newUrl.includes('/fr/ressources') ? 'PASS' : 'FAIL', `url=${newUrl.replace(BASE, '')}`);
        }
      } else {
        log('Explorer link', 'FAIL', 'No link found');
      }
    } catch (e) {
      log('Navigation Explorer', 'FAIL', e.message.substring(0, 60));
    }

    // 5.2 Click on a subject → /fr/matieres/[slug]
    try {
      await page.goto(`${BASE}/fr/matieres`, { waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
      const subjectLink = page.locator('a[href*="/fr/matieres/"]').first();
      if (await subjectLink.count() > 0) {
        const href = await subjectLink.getAttribute('href');
        await subjectLink.click();
        await page.waitForLoadState('domcontentloaded', { timeout: 15000 });
        const newUrl = page.url();
        log('Click subject → navigates', newUrl.includes('/fr/matieres/') ? 'PASS' : 'FAIL', `url=${newUrl.replace(BASE, '')}`);
      } else {
        log('Subject link', 'FAIL', 'No link found');
      }
    } catch (e) {
      log('Navigation subject', 'FAIL', e.message.substring(0, 60));
    }

    // ============================================================
    // 6. API ENDPOINTS
    // ============================================================
    console.log('\n=== 6. API endpoints ===');

    const apiTests = [
      { url: '/api/health', name: 'Health' },
      { url: '/api/ressources-data', name: 'Ressources data' },
      { url: '/api/professeurs/data', name: 'Professeurs data' },
      { url: '/api/search/suggest?q=math', name: 'Search suggest' },
      { url: '/api/search/resources?pageSize=5', name: 'Search resources' },
    ];

    for (const { url, name } of apiTests) {
      try {
        const start = Date.now();
        const resp = await page.request.get(`${BASE}${url}`);
        const loadTime = Date.now() - start;
        const ok = resp.status() === 200;
        const text = await resp.text();
        log(`API ${name}`, ok ? 'PASS' : 'FAIL', `${resp.status()} | ${loadTime}ms | ${text.length} bytes`);
      } catch (e) {
        log(`API ${name}`, 'FAIL', e.message.substring(0, 60));
      }
    }

    // ============================================================
    // 7. RTL (Arabic) — verify content is Arabic
    // ============================================================
    console.log('\n=== 7. RTL Arabic content ===');

    try {
      const start = Date.now();
      await page.goto(`${BASE}/ar`, { waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
      const loadTime = Date.now() - start;
      // Check for Arabic strings in the body
      const arabicCount = await page.evaluate(() => {
        const text = document.body.innerText;
        // Count Arabic characters
        const arabicMatches = text.match(/[\u0600-\u06FF]/g);
        return arabicMatches ? arabicMatches.length : 0;
      });
      // Check for French strings (should be few/none)
      const frenchWords = await page.evaluate(() => {
        const text = document.body.innerText;
        const m = text.match(/\b(plateforme|ressources|élèves|cours|devoirs)\b/gi);
        return m ? m.length : 0;
      });
      log('Arabic content /ar', arabicCount > 50 ? 'PASS' : 'FAIL', `${loadTime}ms | ${arabicCount} AR chars, ${frenchWords} FR words`);
    } catch (e) {
      log('Arabic content', 'FAIL', e.message.substring(0, 60));
    }

    // ============================================================
    // 8. MOBILE VIEWPORT
    // ============================================================
    console.log('\n=== 8. Mobile viewport ===');

    try {
      const mobileCtx = await browser.newContext({
        viewport: { width: 375, height: 667 },
        ignoreHTTPSErrors: true,
        userAgent: 'Mozilla/5.0 (iPhone) Mobile',
      });
      const mobilePage = await mobileCtx.newPage();
      const start = Date.now();
      await mobilePage.goto(`${BASE}/fr`, { waitUntil: 'domcontentloaded' });
      await mobilePage.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
      const loadTime = Date.now() - start;
      await mobilePage.screenshot({ path: `${SCREENSHOT_DIR}/mobile-home.png` });
      const h1 = await mobilePage.locator('h1').first().textContent({ timeout: 5000 });
      log('Mobile home /fr (375px)', h1 ? 'PASS' : 'FAIL', `${loadTime}ms | h1="${h1?.substring(0, 30)}"`);
      
      // Check mobile menu
      await mobilePage.goto(`${BASE}/fr/ressources`, { waitUntil: 'domcontentloaded' });
      const burgerBtn = await mobilePage.locator('button[aria-label*="menu" i], button[aria-label*="Menu" i]').count();
      log('Mobile menu button', burgerBtn > 0 ? 'PASS' : 'FAIL', `${burgerBtn} menu buttons found`);
      
      await mobileCtx.close();
    } catch (e) {
      log('Mobile tests', 'FAIL', e.message.substring(0, 60));
    }

    await ctx.close();

  } finally {
    await browser.close();
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log(`SUMMARY: ${pass} PASS | ${fail} FAIL`);
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
