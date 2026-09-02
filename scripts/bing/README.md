# Bing Webmaster Tools Scripts

Scripts for managing Examanet's presence on Bing.

## Setup

API key stored at `/workspace/.secrets/bing-webmaster-api-key` (chmod 600).

To regenerate:
1. Go to https://www.bing.com/webmasters → Settings → API Access
2. Click "Generate API Key"
3. Save: `echo "<key>" | sudo tee /workspace/.secrets/bing-webmaster-api-key`

## Scripts

### `submit-sitemap.mjs`
Submit the sitemap to Bing for indexing.
```bash
node scripts/bing/submit-sitemap.mjs              # default: sitemap.xml
node scripts/bing/submit-sitemap.mjs sitemap-images.xml
```
Endpoint: `POST /SubmitFeed` (note: legacy name, NOT SubmitSitemap)

### `submit-url.mjs`
Submit individual URLs for instant indexing (Bing has daily quotas).
```bash
node scripts/bing/submit-url.mjs                                # submits 5 default key URLs
node scripts/bing/submit-url.mjs https://examanet.com/about     # single URL
node scripts/bing/submit-url.mjs url1 url2 url3                 # batch
```
Endpoint: `POST /SubmitUrlBatch` (more efficient than single SubmitUrl)

## Endpoint reference

| Endpoint | Method | Status |
|----------|--------|--------|
| `SubmitFeed` | POST | ✅ Working (sitemap) |
| `SubmitUrl` | POST | ✅ Working (single URL) |
| `SubmitUrlBatch` | POST | ✅ Working (multiple URLs) |
| `GetCrawlStats` | POST | ❌ 404 Endpoint not found |
| `GetCrawlIssues` | POST | ❌ 404 Endpoint not found |
| `GetQueryStats` | POST | ❌ 404 Endpoint not found |
| `GetSitemaps` | GET | ❌ 404 Endpoint not found |
| `GetSites` | GET | ❌ 404 Endpoint not found |

**Note**: Most GET endpoints are not available on the public API. For monitoring,
use the Bing Webmaster Tools UI directly:
https://www.bing.com/webmasters → Reports & Data

## Verification

Site verification via HTML meta tag:
- `<meta name="msvalidate.01" content="C04AC04227DB04DAC96552F4A27BCD73" />`
- Located in `src/app/layout.tsx`

## Timeline

- **2026-07-02**: Bing Webmaster Tools account created, sitemap submitted, scripts added