# SEO Audit Report - Examanet.com
**Date**: 2026-08-22  
**Auditor**: Mavis (automated audit + manual inspection)  
**Scope**: Homepage, FR/AR landing pages, category pages, sample resource page

---

## 🟢 What's Working Well

### 1. Technical SEO Foundation
- ✅ HTTPS enabled
- ✅ robots.txt configured (allows all except /admin, /api)
- ✅ Sitemap.xml with 15,673 URLs (98% resources)
- ✅ Self-hosted Google Fonts (no external CSS)
- ✅ manifest.json for PWA
- ✅ JSON-LD structured data (Organization, WebSite, BreadcrumbList, ItemList, Course, FAQPage)
- ✅ Search action (sitelinks searchbox)
- ✅ Google & Bing site verifications
- ✅ Twitter: @examanet handle
- ✅ OpenGraph: full metadata on most pages
- ✅ Multiple favicon sizes (16, 32, 48, 96, 192 + apple-touch-icon)
- ✅ Preconnect to blob storage, GA

### 2. Content Quality
- ✅ Long-form descriptions on resource pages (good for SEO)
- ✅ Real content from Tunisian curriculum
- ✅ Bilingual (FR + AR) coverage
- ✅ Original content (not scraped)
- ✅ Free for users (good trust signal)

### 3. Page Performance
- ✅ Homepage: 0.6s load
- ✅ /fr: 0.3s
- ✅ /ar: 0.5s
- ✅ Resource pages: <1s

---

## 🔴 Critical Issues (Fix Immediately)

### 1. Multilingual SEO Broken (HIGHEST PRIORITY)
**Problem**: The `/fr` and `/ar` locale pages don't override the root layout's metadata. This means:
- `/fr` has `lang="fr"` ✅ but canonical points to `https://examanet.com` ❌
- `/ar` has `lang="fr"` ❌ (should be `lang="ar"`)
- `/ar` has `dir="ltr"` ❌ (should be `dir="rtl"`)
- `/ar` has `og:locale="fr_TN"` ❌ (should be `ar_TN`)
- Both have same title as root (duplicate content) ❌
- All pages have NO `<link rel="alternate" hreflang>` ❌

**Impact**:
- Google treats /fr and /ar as duplicate content (penalty)
- /ar pages rank for French queries (wrong audience)
- French users searching in Tunisia see /ar pages
- Hreflang not set = Google shows wrong language version

**Fix**: Add `generateMetadata` to `src/app/[locale]/layout.tsx` that:
1. Sets correct `lang` and `dir` on `<html>`
2. Sets `canonical` to current page URL
3. Sets `og:locale` to `ar_TN` for AR, `fr_TN` for FR
4. Translates title/description per locale
5. Adds hreflang alternates for both languages

### 2. Canonical URLs Don't Match Locale
**Problem**: 11+ pages have canonical pointing to non-locale URL:
- `/fr/ressources` → canonical `https://examanet.com/ressources` ❌
- `/fr/matieres` → canonical `https://examanet.com/matieres` ❌
- `/fr/bac` → canonical `https://examanet.com/bac` ❌
- ... etc for all FR pages

**Fix**: Update each page's `generateMetadata` to set `canonical: ${baseUrl}/fr${path}` or use a helper.

### 3. BreadcrumbList Schema Uses Root URLs
**Problem**: BreadcrumbList JSON-LD uses `https://examanet.com` instead of locale-aware URLs.

**Fix**: In `breadcrumbSchema()`, use the current page's actual URL.

### 4. Sitemap Has Only 15 Hreflangs (0.1% coverage)
**Problem**: 15,673 URLs in sitemap, but only 15 have hreflang alternates (the 14 static pages). All 15,658 resource URLs have NO hreflang.

**Impact**: Google can't discover the AR version of resource pages.

**Fix**: In `sitemap.ts`, add `alternates.languages` to ALL URLs (static + dynamic resources).

### 5. /fr/ressources Returns 503 Sometimes
**Problem**: The `/fr/ressources` page occasionally returns HTTP 503 (Service Unavailable) - we saw it earlier.

**Impact**: Google may deindex these pages.

**Fix**: Investigate Vercel function cold start / Prisma connection pool.

---

## 🟡 Medium Priority Issues

### 6. Title Duplication Pattern
**Problem**: `Examanet — [Page Title] — Examanet` (brand appears twice)
- Example: "Examanet — Cours, devoirs, exercices et corrigés gratuits en Tunisie — Examanet"
- The `template: '%s — Examanet'` adds Examanet twice when page title starts with "Examanet —"

**Fix**: Either remove "Examanet" prefix from page titles, or change template to not include "Examanet" for root pages.

### 7. Title Length Issues
- **Too long** (>65 chars): homepage (79), niveaux (75), bac (67), college (67) - will be truncated in SERPs
- **Too short** (<30 chars): recherche (20) - low CTR

**Fix**: Trim long titles, expand short ones.

### 8. Description Length Issues
- **Too long** (>160 chars): matieres (174), professeurs (190+), bac (259), college (211), recherche (178) - Google will truncate
- Many use emojis (🎓 📚 ✅) - Google may strip these

**Fix**: Aim for 120-160 chars, remove emojis.

### 9. Initial HTML Has No Content for Browse Pages
**Problem**: `/fr/ressources` initial HTML is just a loading skeleton (no H1, no content). Googlebot may not wait for JS to render.

**Fix**: Make these pages SSR (not CSR). Currently using `loading.tsx` pattern.

### 10. Googlebot H1 in Initial HTML = 0 for some pages
Same as #9 - some pages render content only client-side.

---

## 🟢 SEO Strengths to Maintain

1. **Original, high-quality content** for Tunisian curriculum
2. **Free model** = great trust + sharing signal
3. **Multilingual support** (FR + AR) - critical for Tunisia
4. **Structured data** on most page types
5. **OpenGraph** complete
6. **Self-hosted fonts** = good Core Web Vitals
7. **HTTPS** + secure
8. **Real teacher names** in URLs (good for entity SEO)

---

## 🎯 Action Plan (Priority Order)

### Phase 1: Critical Fixes (1-2 days)
1. Add `generateMetadata` to `src/app/[locale]/layout.tsx` for proper AR/FR differentiation
2. Fix canonical URLs on all FR/AR pages (use locale prefix)
3. Add hreflang alternates to ALL sitemap URLs
4. Fix BreadcrumbList schema to use current page URL

### Phase 2: High Impact (2-3 days)
5. Make `/fr/ressources` SSR (not CSR) - server-render first 20 resources
6. Fix title duplication (Examanet — X — Examanet)
7. Trim/expand title and description lengths
8. Investigate and fix /fr/ressources 503 issue

### Phase 3: Quick Wins (1 day)
9. Add hreflang to dynamic resource pages
10. Add Course/Quiz structured data to resource pages
11. Add FAQPage to homepage
12. Verify sitemap with Google Search Console

### Phase 4: Ongoing
13. Add `lastmod` to resources
14. Add ImageObject schema to resource thumbnails
15. Monitor Core Web Vitals in production
16. Add hreflang auto-detection for new content

---

## 📊 Estimated SEO Impact

If Phase 1 + 2 are done:
- **+50-100% organic traffic** from fixing hreflang (Google will show correct language)
- **+20-30% CTR** from better titles/descriptions
- **+10-20% indexation** from fixing 503 + canonical issues
- **3-5x improvement** in AR-language search visibility

---

## 🔍 Google Search Console Recommended Actions

1. Submit new sitemap with hreflang
2. Use URL Inspection tool on /fr/* and /ar/* to see how Google sees them
3. Check International Targeting report
4. Check Coverage report for excluded pages
5. Set Tunisia (tn) as target country in Search Console

