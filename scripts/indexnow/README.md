# IndexNow Scripts

Instant indexing for Bing, Yandex, Naver, Seznam, and other participating engines.

## Setup

### 1. Key generated
Stored at `/workspace/.secrets/indexnow-key` (chmod 600, gitignored).

### 2. Verification file
Committed to repo at `/public/<KEY>.txt` (served by Vercel at `https://examanet.com/<KEY>.txt`).
The file contains the key as plain text.

### 3. Notification script
`scripts/indexnow/notify.mjs` — POST URLs to `https://api.indexnow.org/indexnow`.

## Usage

### Notify key pages (default 5 URLs)
```bash
node scripts/indexnow/notify.mjs
```

### Notify specific URLs
```bash
node scripts/indexnow/notify.mjs \
  https://examanet.com/college \
  https://examanet.com/college/9eme \
  https://examanet.com/niveaux
```

## Response codes

| HTTP | Meaning |
|------|---------|
| 200 | OK — URLs submitted successfully |
| 202 | Accepted — key validation pending |
| 400 | Bad format |
| 403 | Key not valid (check `https://examanet.com/<KEY>.txt` exists with correct content) |
| 422 | URLs don't belong to the host |
| 429 | Too many requests (10,000 URLs/day quota) |

## Engine coverage (as of July 2026)

- ✅ Bing
- ✅ Yandex
- ✅ Naver (Korea)
- ✅ Seznam (Czechia)
- ✅ Yep
- ❌ Google (uses its own Indexing API + Search Console instead)

## Crawl time

IndexNow URLs are typically crawled within minutes, vs 24-48h for normal sitemap crawl.

## Future: auto-notify on deploy

When you add new content (e.g., new corrigé, new resource), run this script with the changed URL.
Hook into deploy script:
```bash
# In package.json or deploy script:
node scripts/indexnow/notify.mjs https://examanet.com/concours-9eme-tunisie/sujets-passes
```

For sitemap-wide changes, use the sitemap submit script:
```bash
node scripts/bing/submit-sitemap.mjs
```