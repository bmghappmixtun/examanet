# Google Search Console Scripts

Setup:
- Service Account JSON key at `/workspace/.secrets/gsc-key.json` (gitignored).
- Service Account email must be **Owner** on the GSC property.

## Scripts

### `test-connection.mjs`
Smoke test — lists sites accessible by the service account.
```bash
node scripts/gsc/test-connection.mjs
```

### `submit-sitemap.mjs`
Submit (or refresh) the sitemap.
```bash
node scripts/gsc/submit-sitemap.mjs              # default: sitemap.xml
node scripts/gsc/submit-sitemap.mjs sitemap-resources.xml   # for split sitemaps
```

### `analytics.mjs`
Human-readable top queries / pages / countries.
```bash
node scripts/gsc/analytics.mjs                  # last 28 days
node scripts/gsc/analytics.mjs 7                # last 7 days
```

### `inspect.mjs`
URL Inspection for any URL (or batch of defaults).
```bash
node scripts/gsc/inspect.mjs                    # defaults: /, /college, /faq, /matieres, /professeurs
node scripts/gsc/inspect.mjs college            # single URL
node scripts/gsc/inspect.mjs https://examanet.com/ressources/some-slug
```
Notes:
- Uses `https://www.googleapis.com/auth/webmasters` scope (not readonly).
- Verdict meanings:
  - `PASS` = indexed ✅
  - `NEUTRAL` = detected but not indexed yet (will be, eventually)
  - `FAIL` = blocked / soft 404 etc.

### `monitor.mjs`
Aggregated JSON + Markdown report. Designed for daily cron.
```bash
node scripts/gsc/monitor.mjs                    # last 1 day
node scripts/gsc/monitor.mjs 7                  # last 7 days
```
Output:
- Console: JSON totals
- `/tmp/gsc-report-YYYY-MM-DD.md`: human-readable Markdown

## API scopes

| Library | Methods | Scope |
|---------|---------|-------|
| `@googleapis/webmasters` v3 | searchanalytics, sitemaps, sites | `webmasters.readonly` |
| `@googleapis/searchconsole` v1 | urlInspection (URL Inspection API) | `webmasters` |

Note: the `searchconsole` namespace uses the older API URL but exposes
the modern URL Inspection endpoint.

## Setting up automated daily monitoring

Cron entry (every day at 3am Europe/Paris):
```
0 3 * * * cd /workspace/edutunisie && node scripts/gsc/monitor.mjs 1 >> /var/log/gsc-monitor.log 2>&1
```

Or via the mavis cron tool (see Admin settings).
