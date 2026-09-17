# Sitemap Architecture

**Last updated** : 2026-09-17  
**Total URLs indexed** : ~17,584 (split across 8 sub-sitemaps + 1 image-sitemap)

---

## 📐 Overview

The sitemap is split into multiple files to:
- Avoid hitting Google's 50,000 URLs/file limit (we're well under)
- Allow different cache TTLs per content type (resources refresh hourly, archives weekly)
- Make debugging easier per content type

## 🗂️ File Structure

```
src/
├── app/
│   ├── sitemap.xml/route.ts           # Sitemap INDEX (8 sub-sitemaps)
│   ├── sitemap-static.xml/route.ts    # 14 hand-curated pages
│   ├── sitemap-classes.xml/route.ts   # ~7 /niveaux/<slug>
│   ├── sitemap-subjects.xml/route.ts  # ~30 /matieres/<slug>
│   ├── sitemap-teachers.xml/route.ts  # 200 top teachers by resources
│   ├── sitemap-resources-1.xml/route.ts  # Top 5,000 resources by engagement
│   ├── sitemap-resources-2.xml/route.ts  # Next 5,000
│   ├── sitemap-resources-3.xml/route.ts  # Remaining ~5,400
│   └── image-sitemap.xml/route.ts    # Top 100 by views
└── lib/
    ├── sitemap-helpers.ts           # Shared helpers
    └── build-resources-sitemap.ts    # Resources chunked builder

scripts/
└── validate-sitemap.sh              # XML validation (Python + curl)
```

## 🔗 URL Map

| URL | Format | Refresh | URLs |
|-----|--------|---------|-----:|
| `/sitemap.xml` | `<sitemapindex>` | hourly | 8 (refs) |
| `/sitemap-static.xml` | `<urlset>` | hourly | 14 |
| `/sitemap-classes.xml` | `<urlset>` | daily | 7 |
| `/sitemap-subjects.xml` | `<urlset>` | daily | 30 |
| `/sitemap-teachers.xml` | `<urlset>` | daily | 2,433 |
| `/sitemap-resources-1.xml` | `<urlset>` | hourly | 5,000 |
| `/sitemap-resources-2.xml` | `<urlset>` | daily | 5,000 |
| `/sitemap-resources-3.xml` | `<urlset>` | weekly | 5,000 |
| `/image-sitemap.xml` | `<urlset>` | daily | 100 |
| **TOTAL** | | | **~17,584** |

## 🛠️ Why this architecture (vs. `generateSitemaps()`)

Next.js offers three ways to build sitemaps:

| Pattern | Pros | Cons |
|---------|------|------|
| `app/sitemap.ts` (Next.js metadata route) | TypeScript types, clean | Forces `<urlset>` (no `<sitemapindex>`), no URL control |
| `app/sitemap.ts` + `generateSitemaps()` | Built-in index, dynamic | URLs forced to `/<route>/sitemap/<id>.xml` pattern |
| `app/<route>.xml/route.ts` (raw XML) | Full control over URLs and format | More code |

We chose the **third pattern** because:
1. We want URLs at root (`/sitemap-resources-1.xml`, not `/sitemap-resources/sitemap/1.xml`)
2. We want proper `<sitemapindex>` format (Next.js metadata route doesn't support it)
3. We want different `Cache-Control` per sub-sitemap
4. The `generateSitemaps()` URL pattern would break our existing SEO backlinks + require GSC resubmission

## 🛡️ Cache Strategy

All sitemaps use `Cache-Control: public, max-age=N, stale-while-revalidate=86400`.

The `stale-while-revalidate=86400` means:
- CF Workers caches the response for `N` seconds (varies per sitemap)
- After expiry, **stale copy is served** for up to 24 hours while a fresh copy is generated in the background
- Users (and Googlebot) **never** see a slow or 503 response during regeneration

This is the recommended pattern from [commentcoder.com](https://www.commentcoder.com/blog/nextjs-sitemap).

## 🌍 Multilingual Sitemaps

Every URL in every sub-sitemap includes `<xhtml:link rel="alternate">` tags for:
- `fr-TN`: French (canonical, default locale)
- `ar-TN`: Arabic
- `x-default`: Default (FR)

Implementation: `withAlternates(path, priority, changeFreq)` in `src/lib/sitemap-helpers.ts`.

## 📋 Submission to Google Search Console

To submit the new sitemap index:
1. Login to https://search.google.com/search-console
2. Select the `examanet.com` property
3. Navigate to **Sitemaps** in the left sidebar
4. Enter `sitemap.xml` in the "Add a new sitemap" field
5. Click **Submit**
6. Google will crawl the index and discover all 8 sub-sitemaps within 24-48h

## ✅ Validation

Run `./scripts/validate-sitemap.sh` to validate all 9 endpoints against prod:
- HTTP 200 check
- Valid XML (Python parser)
- Correct root element (`<sitemapindex>` or `<urlset>`)
- URL count

This script is intended to be added to CI for regression detection (TODO).

## 🔄 Future Improvements

- [ ] Add CI step that runs `validate-sitemap.sh` after deploy
- [ ] Add `/api/internal/sitemap-health` endpoint for monitoring
- [ ] Update `image-sitemap.xml` to use `sitemapCacheHeaders` for consistency
- [ ] Consider migrating to `generateSitemaps()` if URL pattern flexibility is added

## 📚 References

Best practices sourced from:
- [Next.js docs: sitemap](https://nextjs.org/docs/app/api-reference/file-conventions/metadata/sitemap)
- [Next.js docs: generateSitemaps](https://nextjs.org/docs/app/api-reference/functions/generate-sitemaps)
- [raddy.dev: Multiple sitemaps](https://raddy.dev/blog/multiple-sitemaps-in-nextjs-app-router-sitemap-index/)
- [next-intl: Multilingual sitemap](https://dev.to/oikon/implementing-multilingual-sitemap-with-next-intl-in-nextjs-app-router-1354)
- [yiminyang: Optimization](https://www.yiminyang.dev/blog/optimizing-your-nextjs-sitemap-with-next-sitemap-a-complete-guide)
- [Sanity: SEO](https://www.sanity.io/learn/course/seo-optimization/building-a-dynamic-sitemap)
