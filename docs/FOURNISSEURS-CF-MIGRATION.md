# Page Fournisseurs — Migration Cloudflare (2026-09-08)

## ✅ Implementation
Remplacé Vercel et Neon par Cloudflare + D1 + R2 comme infrastructure principale.
Vercel et Neon sont conservés en section "Ancienne infrastructure" (read-only).

### Files
- `src/lib/external-services.cloudflare.ts` (NEW, 362 lines)
  - `checkCFWorkersUsage(token)` — Workers request/error/CPU stats via GraphQL
  - `checkD1Usage(token)` — D1 size, query count, row stats
  - `checkR2Usage(token)` — R2 storage, object count, class A/B ops
- `src/app/api/admin/external-services/route.ts`
  - Added 'cloudflare', 'd1', 'r2' to TYPE_VALUES
  - CF-native types use `CF_API_TOKEN` env secret (no user-supplied token)
  - Updated `getEmptyUsage()` for new types
- `src/app/admin/fournisseurs/FournisseursClient.tsx`
  - Added `cloudflare`, `d1`, `r2` state
  - New `CloudflareCard`, `D1Card`, `R2Card` components
  - Renamed "Infrastructure" section to "Infrastructure Cloudflare" (source de vérité)
  - Added "Ancienne infrastructure" section with Vercel + Neon (opacity-60, dimmed)

### Authentification
- New `CF_API_TOKEN` secret added to CF Worker via `wrangler secret put`
- Token scope: Account Analytics: Read, D1: Read, R2: Read
- API queries use GraphQL endpoint:
  `https://api.cloudflare.com/client/v4/accounts/{id}/analytics/engine`

### Metrics shown per card
**Cloudflare Workers**
- Requêtes (7j) | Erreurs | Taux de succès | CPU p50/p99

**Cloudflare D1**
- Stockage (MB) | Requêtes (7j) | Rows read | Rows written

**Cloudflare R2**
- Stockage (GB) | Objets | Class A ops (7j) | Class B ops (7j)

### UI design
- Border colors: Workers = orange, D1 = blue, R2 = purple
- Icons: Globe (Workers), Database (D1), Box (R2)
- "Source de vérité" badge on Infrastructure section
- "Plus utilisée" badge on legacy section
- 60% opacity on legacy cards (visual signal)

## 🚧 Deployment pending
CF API returned 503 "DNS cache overflow" during deploy attempt.
Code is committed, build succeeded. Will deploy when CF API recovers.

## 🧪 Verify locally
- All builds pass
- Pre-commit hook passed
- TypeScript types match
- D1 + R2 bucket IDs hardcoded (examanet-db / examanet-pdf-prod)
