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

## 6. Restant ouvert — 574 ressources sans objet R2

Après l'incident du 22/09/2026, **574 ressources PUBLISHED (3,72 %)** pointent vers un objet R2 **inexistant** :
- `TeacherFile.isOriginalLost` (1 954 lignes) ne couvre que les `.doc/.docx` — le PDF n'était **pas** marqué dans la base.
- Ces ressources restent listées/indexées mais leur bouton renvoie la page 404 FR/AR.

Répartition exacte (recalculée le 2026-11-12 sur les 15 421 PUBLISHED vs les 18 465 objets R2) :

| Axe | Répartition |
|---|---|
| **Classe** | 4ᵉ 173 · 7ᵉ 117 · 9ᵉ 86 · 8ᵉ 84 · 3ᵉ 63 · 1ʳᵉ 31 · 2ᵉ 20 → **collège 287 / lycée 287** (moitié-moitié) |
| **Matière** | maths 255 · technologie 142 · physique 76 · SVT 23 · HG 21 · arabe 20 · français 14 · anglais 6 · musique 6 · informatique 4 · islamique 3 · éco 2 · théâtre 1 · civique 1 |
| **Préfixe de clé** | `teacher-library/` 480 · `resources/` 73 · clés plates legacy (`NEW_*`, `OLD_*`, `DC2_*`, `DS2_*`) 21 |

Détail ligne par ligne (numericId, titre, classe, matière, clé R2 attendue) : `output/orphan-resources-2026-11-12.csv`
(CSV RFC 4180 avec BOM UTF-8 → s'ouvre directement dans Excel avec l'arabe correct).

**Décision attendue** : (A) dépublier les 574 (disparition de l'URL, perte de SEO), (B) les laisser en ligne avec la page 404 explicative (recommandé : l'URL reste utile pour le référencement, l'utilisateur comprend), (C) les garder mais les passer en `noindex`.
