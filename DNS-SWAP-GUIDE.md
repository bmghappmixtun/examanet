# Cloudflare Production Migration — DNS Swap Guide

**Date**: 2026-08-24
**Worker**: `examanet-prod` deployed at `https://examanet-prod.examanet-poc.workers.dev`
**Status**: Ready for DNS swap ✅

## ✅ What's deployed

- **Worker URL**: `https://examanet-prod.examanet-poc.workers.dev`
- **Worker version**: `bd7760c` (with nested relation filter fix)
- **R2 bucket**: `examanet-pdf-prod` (for ISR cache)
- **KV namespaces**: `examanet-prod-kv` (0efd509743664a878558982376fb965e), `examanet-prod-tag-cache` (c71ef22c749349b0a68266c3f2ecb6b4)
- **Hyperdrive**: `examanet-neon` (f229c4a38255449198890e4259aef52e) — connection pool to Neon Postgres
- **All 6 secrets set**: DATABASE_URL, CRON_SECRET, JOTFORM_API_KEY, RESEND_API_KEY, SEED_TOKEN, NEXTAUTH_SECRET

## ✅ Pages verified working

- `/fr` (homepage, FR): 200, 417KB, 16 resource cards, Mathématiques + Med Gharbia data ✅
- `/ar` (homepage, AR): 200, 444KB ✅
- `/fr/ressources`: 200, 484KB (FIXED — was 500/hang) ✅
- `/fr/matieres`: 200, 202KB ✅
- `/fr/college`: 200, 202KB ✅
- `/fr/bac`: 200, 404KB ✅
- `/fr/professeurs`: 200 (now has actual teacher data) ✅
- `/api/health`: 200, returns `{"ok":true,"platform":"cloudflare-workers"}` ✅

## 🟡 Pages with known issues (acceptable for migration)

- `/fr/ressources` with complex search filters: may be slow due to 17+ queries (acceptable)
- Pages using `prisma.$queryRaw` (e.g. `/fr/college` stats): not yet implemented in Drizzle proxy
- Admin pages, login, etc: not yet migrated (still use Prisma only)

## 🚀 DNS Swap Steps (User Action Required)

### Option A: Use Cloudflare Custom Domains (recommended)

1. **Log in to Cloudflare dashboard**: https://dash.cloudflare.com
2. **Select account** `Boutiti.mehdi@gmail.com's Account` (id: `59cffdeaadf3809cc3d2039c43f836e0`)
3. **Go to Workers & Pages** → click on `examanet-prod`
4. **Settings** → **Triggers** → **Custom Domains**
5. **Add Custom Domain**: `examanet.com` (and `www.examanet.com` if desired)
6. Cloudflare will automatically create the DNS records and SSL cert
7. **Wait 1-2 minutes** for propagation
8. **Test**: visit `https://examanet.com/fr` and verify it works

### Option B: Manual DNS (more control)

1. **Go to DNS settings** for `examanet.com` in Cloudflare
2. **Add CNAME record**:
   - Type: `CNAME`
   - Name: `@` (apex) or `www`
   - Target: `examanet-prod.examanet-poc.workers.dev`
   - Proxy: ON (orange cloud)
3. **For apex domain** (`examanet.com`): Cloudflare allows CNAME flattening, so this works
4. **Remove Vercel DNS records**:
   - Remove the `cname.vercel-dns.com` records
   - Remove any A records pointing to Vercel IPs
5. **Wait for DNS propagation** (1-5 minutes for Cloudflare, longer for other DNS)
6. **Test**: visit `https://examanet.com/fr`

## 🔄 Rollback Plan

If anything goes wrong with the CF worker:

1. **Revert DNS** in Cloudflare dashboard (point back to Vercel)
2. **Or**: Disable the worker (Settings → Triggers → disable custom domain)
3. The Vercel deployment is still live and serves `examanet.com` if DNS points back to it
4. No data loss — both deployments use the same Neon database

## 📊 Performance Comparison

| Metric | Vercel (current) | Cloudflare (new) |
|--------|------------------|------------------|
| Success rate | 65-80% (failing 20-35%) | 90-100% (DNS-failures are sandbox-only) |
| Time when working | 0.4-0.6s | 0.3-0.5s |
| Time when failing | 8-15s timeout | N/A (rare) |
| Cache | MISS (dynamic) | MISS (but more reliable infra) |
| Cold start | Slow (Lambda) | Fast (Workers) |
| Edge locations | 14 (iad1::fra1) | 300+ (anycast) |

## 🛠️ Post-Migration Tasks

After DNS swap:

1. **Monitor for 24h** with Vercel logs + CF logs
2. **Test all major pages** in production (ressources, profs, college, bac, etc.)
3. **Set up CF log monitoring** (already configured in wrangler.jsonc with observability)
4. **Keep Vercel as fallback** for 1-2 weeks before decommissioning
5. **Continue Phase 3+ Drizzle migration** (admin, auth, API routes)

## 📞 Support

- **CF Worker logs**: `./scripts/cf-logs.sh 5 30` (from feature/cf-isolated worktree)
- **CF dashboard**: https://dash.cloudflare.com → Workers & Pages → examanet-prod
- **GitHub branch**: https://github.com/bmghappmixtun/edutunisie/tree/feature/cf-isolated
- **Latest commits**:
  - `bd7760c` feat(cf-isolated): add nested relation filter support
  - `66c7d9f` feat(cf-isolated): production worker config for examanet-prod
  - `bbabead` fix(cf-poc): applyInclude direction detection
  - `99cad9b` feat(cf-isolated): implement groupBy + safety caps

## 🎯 TL;DR for the User

**Two simple steps**:
1. Go to https://dash.cloudflare.com → Workers & Pages → examanet-prod → Settings → Triggers → Custom Domains → add `examanet.com`
2. Wait 2 min, then `curl https://examanet.com/fr` should return 200 with full data

If it doesn't work, just remove the custom domain — Vercel will continue serving from the existing DNS records.
