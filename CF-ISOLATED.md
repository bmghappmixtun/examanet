# Cloudflare Workers — Isolated Branch

This branch (`feature/cf-isolated`) is **fully independent of Vercel**.

## What changed vs `feature/opennext-cloudflare-poc`

| | Old (opennext-cloudflare-poc) | New (cf-isolated) |
|---|---|---|
| `prisma.ts` | swaps with `prisma.cf.ts` at build | **IS** the CF proxy (permanent) |
| `prisma.cf.ts` | exists, swapped in/out | **DELETED** |
| `swap-prisma-cf.sh` | needed for every CF build | **DELETED** |
| `next.config.js` | patched at deploy (output:standalone, unoptimized) | **baked in** (always CF config) |
| `deploy-cf.sh` | 80 lines, lots of logic | **simplified** to surgery + build + wrangler |
| Vercel involvement | required (swap back, restore config) | **zero** |

## Daily workflow on this branch

```bash
# Make changes
git checkout feature/cf-isolated
# ... edit code ...

# Deploy to CF (one command, no Vercel involved)
./scripts/deploy-cf.sh

# Or just rebuild
./scripts/deploy-cf.sh build

# Or check logs
./scripts/deploy-cf.sh logs 5 30
```

## Pulling Vercel changes

```bash
git fetch origin
git merge origin/main          # or cherry-pick specific commits
./scripts/deploy-cf.sh         # rebuild + deploy
```

## Key files

- `src/lib/prisma.ts` — CF proxy (PrismaPg + Hyperdrive)
- `next.config.js` — has `output: "standalone"` + `images.unoptimized: true`
- `src/app/api/health/route.ts` — detects CF via `__cloudflare-context__` symbol
- `src/app/api/health/db-check.ts` — Vercel-only DB health (dynamic-imported)
- `scripts/deploy-cf.sh` — the only script you need
- `scripts/surgery-cf.sh` — bundle surgery (stub sharp, og, WASM, etc.)
- `scripts/stub-prisma-binary.sh` — replaces 16MB Prisma .so.node with empty file

## Deployment status

- Worker: `examanet-poc` (CF account 59cffdeaadf3809cc3d2039c43f836e0)
- URL: https://examanet-poc.examanet-poc.workers.dev
- Bundle: 12 MB raw / 2.87 MB gzipped
- Last successful deploy: see git log on this branch

## Known limitations (Prisma 5.x)

- Binary engine still tries to load on Workers → fs.readdir fails
- /api/health on CF returns "limited health" (200, no DB query)
- Data sections of pages show loading state if Prisma binary loads
- Full fix: Prisma 6+ WASM engine (blocked by Next 14.2 + OpenNext 1.15.1 compat)
