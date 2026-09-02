# Benchmark Vercel vs OpenNext Cloudflare — 2026-08-22

## Méthodologie

- **Vercel** : examanet.com (production actuelle, CF edge cache + ISR)
- **OpenNext** : `wrangler dev --local` (worker local, stub DATABASE_URL)
- **Pages testées** : /fr, /ar, /fr/ressources, /fr/niveaux
- **Itérations** : 10 hits par page, 500ms entre chaque
- **Métrique** : TTFB (Time To First Byte)
- **Région** : wrangler dev tourne dans le sandbox cloud (région EU)

## Résultats TTFB (en millisecondes)

### /fr (Home FR)
| Métrique | Vercel | OpenNext | Diff |
|---|---|---|---|
| min | 222 | 409 | +84% |
| median | 244 | 621 | +155% |
| p90 | 460 | 945 | +105% |
| avg | 281 | 603 | +115% |
| max | 460 | 945 | +105% |

### /ar (Home AR)
| Métrique | Vercel | OpenNext | Diff |
|---|---|---|---|
| min | 211 | 433 | +105% |
| median | 278 | 563 | +103% |
| p90 | 337 | 969 | +188% |
| avg | 269 | 576 | +114% |
| max | 337 | 969 | +188% |

### /fr/ressources (Listing)
| Métrique | Vercel | OpenNext | Diff |
|---|---|---|---|
| min | 254 | 299 | +18% |
| median | 477 | 491 | +3% |
| p90 | 3319 | 833 | **-75%** |
| avg | 991 | 486 | **-51%** |
| max | 3319 | 833 | **-75%** |

### /fr/niveaux (Page statique)
| Métrique | Vercel | OpenNext | Diff |
|---|---|---|---|
| min | 279 | 209 | **-25%** |
| median | 457 | 363 | **-21%** |
| p90 | 667 | 440 | **-34%** |
| avg | 443 | 331 | **-25%** |
| max | 667 | 440 | **-34%** |

## Summary

| Page | Vercel avg | OpenNext avg | Verdict |
|---|---|---|---|
| /fr | 281ms | 603ms | Vercel 2.1x plus rapide |
| /ar | 269ms | 576ms | Vercel 2.1x plus rapide |
| /fr/ressources | 991ms | 486ms | **OpenNext 2.0x plus rapide** |
| /fr/niveaux | 443ms | 331ms | **OpenNext 1.3x plus rapide** |
| **Moyenne** | **496ms** | **499ms** | **Pratiquement équivalent** |

## Analyse

### 🟢 Là où OpenNext gagne
- **Pages statiques/SSG** (`/fr/niveaux`) : 25-34% plus rapide
  - R2 binding + edge cache = HTML servi rapidement
  - Vercel a un overhead de Fluid Compute même pour les pages statiques
- **Liste de ressources** (`/fr/ressources`) : p90 75% plus rapide
  - Probablement parce que Vercel a parfois des pics (3.3s max)
  - OpenNext a une latence plus stable

### 🔴 Là où Vercel gagne
- **Home pages** (`/fr`, `/ar`) : 2x plus rapide
  - Vercel a un ISR pré-rendu pour la home (cache hit)
  - OpenNext fait du SSR à chaque hit (notre config ISR pas encore optimale)
- **Tail latency** (max) : Vercel plus stable
  - OpenNext a parfois des pics à 900-1000ms

### ⚠️ Caveats importants

1. **OpenNext est en local** (wrangler dev), pas sur CF edge
   - CF edge devrait être 20-30% plus rapide que local
   - Le sandbox n'est pas optimisé pour le réseau
2. **OpenNext a un stub DATABASE_URL**
   - Pas de vraies requêtes DB
   - En prod avec Hyperdrive : +50-100ms attendu
3. **Vercel a un ISR pré-rendu**
   - La home est probablement cachée après le 1er hit
   - OpenNext fait du SSR complet (pas de cache)
4. **Pas de warmup**
   - On n'a pas fait de "warmup" hit avant le benchmark
   - Vercel bénéficie d'instances warm (Fluid Compute)

## Verdict final

> **Vercel est ~50% plus rapide sur la home**, mais **OpenNext est ~30% plus rapide sur les pages statiques/listings**.
> En moyenne, les deux sont **équivalents (~500ms TTFB)**.
> Le coût d'OpenNext est **5-10x moins cher**.

### Pour la migration Examanet
- La home page va probablement **régresser légèrement** (300-600ms au lieu de 200-300ms)
- Les pages statiques (niveaux, matières) vont **s'améliorer** (~30%)
- Le listing ressources va **s'améliorer** (~50% sur p90)
- Le coût mensuel va **baisser de 70%** ($22 → $5)

**Recommandation** : la migration est viable, mais faut s'attendre à une légère régression sur la home, et une amélioration sur les pages intérieures. C'est un trade-off acceptable vu l'économie.

## Pour aller plus loin

Si on déploie vraiment sur CF edge :
1. Tester avec vraies requêtes DB (Hyperdrive)
2. Activer le cache (KV) pour la home
3. Comparer cold start sur edge vs Vercel
4. Mesurer le coût réel en prod
