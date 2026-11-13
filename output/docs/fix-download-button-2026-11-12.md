# Bouton « Télécharger PDF » cassé — diagnostic, correctif et déploiement

**Date** : 2026-11-12 · **Statut** : **CORRIGÉ ET DÉPLOYÉ EN PROD (version 6.96)**
**Portée** : 100 % des ressources (15 421 ressources PUBLISHED) — le bouton bleu « Télécharger PDF » renvoyait un 502.

---

## 1. Symptôme

```
GET https://examanet.com/api/resources/3562/download
→ HTTP 502
Stream error: Invalid URL: /api/file/teacher-library/cmqwnim9l000d106jknf7uu3b/imported/7136396613-GnU20NgzYz6Hj3lt7RmQakQSllcEc8.pdf
```

Clic sur « Télécharger PDF » → page blanche / erreur sur **toutes** les ressources.

## 2. Cause racine (notre code, pas le stockage)

Après la migration **Vercel Blob → Cloudflare R2**, `Resource.fileUrl` est un **chemin RELATIF** :

```
/api/file/teacher-library/<id>/imported/<fichier>.pdf
```

Vérifié en D1 : **15 421 / 15 421** ressources PUBLISHED ont un `fileUrl` relatif, **0 URL absolue**.

Or la route `src/app/api/resources/[id]/download/route.ts` faisait :

```ts
const sourceUrl = ...;          // "/api/file/teacher-library/..."
const response = await fetch(sourceUrl);   // ← URL relative → « Invalid URL »
```

`fetch()` côté Worker exige une URL absolue ⇒ `TypeError: Invalid URL` ⇒ `catch` ⇒ **502**.
Les PDF eux-mêmes sont **intacts** (12/12 tirages aléatoires : `GET /api/file/<clé>` → 200 + vrai PDF ; `wrangler r2 object get` confirme les clés).

> ⚠️ **Le diagnostic de la nuit #29 était faux** (« stockage amont → backfill `fileUrl`/`r2Key` »). Le corps de la réponse (`Stream error: Invalid URL`) désignait notre route. Règle appliquée désormais : **lire le corps du 5xx avant de conclure « amont »**.

## 3. Correctif

### 3.1 Lecture directe de R2 (source de vérité)
`streamFromR2()` :
- binding `PDFS_BUCKET` ; `TEXT_BUCKET` si la clé commence par `text/` ;
- priorité des clés : `Resource.r2Key` → `Resource.fileKey` → suffixe de `fileUrl` après `/api/file/` ;
- 404 explicite si l'objet est absent ;
- en-tête de diagnostic `X-Storage-Backend: r2`.

### 3.2 Repli proxy HTTP
Si la ressource n'a aucune clé exploitable :.proxy HTTP avec **résolution des URL relatives contre `req.nextUrl.origin`** (plus jamais de `fetch()` sur une URL relative).

### 3.3 Page d'erreur FR/AR lisible
Statut **404**, `Content-Type: text/html; charset=utf-8`, `Content-Language: fr|ar`, `X-Document-Status: missing-in-storage` :
- FR : « Document indisponible »
- AR : « الوثيقة غير متوفرة »

> **Langue = celle de la RESSOURCE** (champ `Resource.language`), pas celle du navigateur.
> Bug corrigé le 2026-11-12 après le premier déploiement : la langue venait de l'en-tête
> `Accept-Language`, donc un document **arabe** affichait « Document indisponible » en français
> pour un visiteur francophone (et l'inverse). L'en-tête ne sert plus que de repli.
> Vérification : `scripts/verify-download-missing-lang.mjs` → 10/10 sur dev.

### 3.4 Nom de fichier téléchargé
`toAsciiName()` : translittération NFD + retrait des diacritiques (`œ→oe`, `æ→ae`) ; si le titre n'a pas ≥ 3 lettres latines → `document-<numericId>.pdf`.

> **Contrainte navigateur** : Chromium n'utilise `filename` que s'il est **ASCII pur** et **rejette `filename*` non-ASCII sans repli** (le fichier s'enregistre alors sous « download »). ⇒ **jamais de `filename*` en arabe**, header final : `Content-Disposition: attachment; filename="document-3562.pdf"`.

## 4. Déploiement

| Étape | Détail |
|---|---|
| Worktree | `.worktrees/fix-download-relative-fileurl` (branche `fix/download-relative-fileurl`, base `origin/main` = `1c87edae`) |
| `node_modules` | hardlinkés (`cp -al`) — symlink cassait la résolution runtime OpenNext ; `npm ci` ≈ 18 min sur NFS |
| Build | `npx next build` puis `npx opennextjs-cloudflare build --skipNextBuild` (**bun absent dans le sandbox** → `opennextjs-cloudflare build` seul échoue en 127) |
| Dev | `npx wrangler deploy --config wrangler.dev.jsonc` → version `a3bd4394-…` |
| Prod | merges sur `main` + push (`https://x-access-token:${TOKEN}@github.com/...`, inline, jamais dans `.git/config`) → GH Actions `43310930599`, `43312403167`, `43314273553`, `43317560915` **tous success** |
| Commits | `96a272ba` (lecture R2) → `3de0d235` + `54c27c5c` (page 404 FR/AR + audit) → merge `06495a78` → `2c037311` (RFC 5987, **non-ASCII → invalide**) → merge `904c3035` → `6b72e9e2` (ASCII strict) → merge **`a5b8d0f1`** = prod **6.96** (worker CF **737**) |

## 5. Vérifications (prod)

- `scripts/verify-download-route.mjs https://examanet.com 30` → **28/30** en 200 + `application/pdf` + magic `%PDF` ; les **2 échecs sont des 404 explicites** (ressources orphelines § 6).
- `scripts/verify-download-button.cjs` → **clic réel** sur le bouton bleu dans Chromium : téléchargement déclenché, fichier nommé `document-3562.pdf`.
- En-têtes observés : `content-type: application/pdf`, `content-disposition: attachment; filename="document-3562.pdf"`, `x-storage-backend: r2`.

## 6. Les 574 « orphelines » — restaurées le 2026-11-13 (état final : 1 seule)

### 6.1 Deux ensembles distincts (le point qui prêtait à confusion)

| | Ressources | Ce qui manque | Qui est concerné |
|---|---|---|---|
| **Original prof perdu** | **1 941** | le `.doc` / `.docx` original du prof (`TeacherFile.isOriginalLost = 1`) | **profils prof/admin uniquement** — le bouton « Télécharger l'original » est rendu seulement si `isTeacher` (`src/components/resources/ResourceActions.tsx:220`) ; leur **PDF public est intact** |
| **PDF public absent de R2** | **574** | le **PDF** lui-même (clé absente du bucket `examanet-pdf-prod`) | **tout le monde** — c'est le bouton bleu « Télécharger PDF » |

Chevauchement entre les deux ensembles : **3 ressources** seulement. Les 574 ne sont donc *pas* les fichiers `.doc/.docx` supprimés.

### 6.2 Les 574 n'étaient pas perdues : le store Vercel Blob est toujours vivant

Le store Vercel Blob d'origine (`kmy1h6us8l7bg7bg.public.blob.vercel-storage.com`) **n'a jamais été supprimé** et sert toujours les objets sous le **chemin exact** attendu par la route (`teacher-library/<id>/imported/<nom>.pdf`) :

- recherche par nom de fichier / suffixe / casse dans les 18 465 objets R2 → **0 correspondance** (les objets avaient bien disparu de R2) ;
- recherche dans les 5 autres buckets du compte (`examanet-architecture`, `examanet-cache`, `examanet-poc-cache`, `examanet-text-prod`, `primaireprivee-pdfs`) → **0 correspondance** ;
- **HEAD sur l'URL Vercel construite avec la clé R2 → 573/574 répondent 200** (448,5 Mo).

Restauration : `scripts/restore-orphan-pdfs-from-vercel.mjs` (S3 SDK → R2, clé identique, `Content-Type: application/pdf`).
Sûreté : **HEAD R2 avant chaque écriture** ⇒ on n'écrit que sur des clés **absentes** (aucune donnée existante écrasée). Dry-run : 573 ok / 0 échec, puis `--apply` : **573 restaurés**, 448,5 Mo. Bucket après : **19 038 objets** (18 465 + 573).

**Aucun code applicatif n'a été modifié** : la route lit déjà la bonne clé, le bouton repart tout seul.

### 6.3 État final vérifié en prod

| Vérification | Résultat |
|---|---|
| Audit D1 ↔ R2 (15 421 PUBLISHED vs 19 038 objets) | **1 seule ressource sans objet** (0,01 %) au lieu de 574 |
| 25 ressources restaurées téléchargées en prod | **25/25** en 200 + `application/pdf` + magic `%PDF` |
| Échantillon D1 aléatoire (30) | **29/30** (l'échec = la ressource 93, réellement disparue) |
| Ressources 1457 / 5547 / 1869 (anciennement 404) | **200 + PDF** |

**Reste 1 ressource** (`numericId 93`, 3AS maths, `teacher-library/cmqme0ho00004si0lgal3c943/...`) : absente de R2 **et** en 404 sur Vercel ⇒ définitivement perdue. Elle affiche la page 404 FR/AR.

### 6.4 Le vrai risque à refermer

La copie R2 avait dérivé du store Vercel (incident du 22/09/2026) et **rien ne l'a signalé pendant ~3 mois** : le store Vercel est la source de vérité off-site, R2 n'est qu'un miroir.
Le script `scripts/backup/blob-sync-r2.mjs` existe mais **n'est jamais exécuté automatiquement** (aucun workflow planifié). Le resync du 24/08/2026 (`backups/r2-inventory-2026-08-24/resync.log`) avait déjà vu **1 340 fichiers manquants** — tous en échec, donc non traités.
→ **Recommandation** : un workflow planifié (ex. quotidien) qui re-synchronise Vercel → R2 et **alerte** dès qu'un objet manque. C'est ce qui aurait évité 574 téléchargements cassés.

**Décision user (2026-11-13)** : ne rien dépublier — l'état « en ligne avec page 404 explicative » est conservé pour le cas résiduel (1 ressource).
