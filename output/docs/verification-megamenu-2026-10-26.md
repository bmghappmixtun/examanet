# Vérification des liens du méga-menu « Catalogue » — 2026-10-26

Source : `examanet.com` (prod), méga-menu = `MenuMatieresCollegeLycee` (le seul rendu par le header).
Périmètre : **141 liens uniques** extraits du panneau rendu (onglet Collège + onglet Lycée), pas de la liste théorique.

Outils : `scripts/extract-megamenu-links.cjs` (extraction Playwright scopée au `role="dialog"`)
+ `scripts/verify-megamenu-counts.mjs` (3 sources de vérité par lien).
Relevé complet : `output/docs/megamenu-counts-2026-10-26.csv` · liens : `output/docs/megamenu-links-2026-10-26.json`.

---

## Méthode

Pour chaque lien, 3 chiffres sont comparés :

| # | Source | Ce que c'est |
|---|---|---|
| **A** | Stat du hero dans le HTML SSR | le nombre **affiché** à l'utilisateur |
| **B** | `GET /api/{devoirs\|series\|cours}/{slug}/list?cycle=…` | le nombre **réellement listable** (l'API que la page consomme) |
| **C** | `GET /api/ressources-data?subject=…&type=…&class=…` | la **même sélection via `/fr/ressources`** (le comparatif demandé) |

Équivalences : `devoirs`→`type=DEVOIR`, `series`→`type=EXERCISE`, `cours`→`type=COURSE` ;
`cycle=college`→classes `7eme,8eme,9eme` ; `cycle=lycee`→`1ere,2eme,3eme,4eme-secondaire` ;
`/fr/matieres/{s}` → sans filtre type ni classe.

## Résultat global

| Statut | Nombre | Part |
|---|---|---|
| ✅ OK | 103 | 73 % |
| ⚠️ Page vide (0 ressource) | 33 | 23 % |
| ⚠️ Écart hero ≠ listing | 3 | 2 % |
| ⚠️ Compte figé en meta description | 2 | 1 % |
| ❌ Erreur HTTP | **0** | 0 % |

**Aucun lien ne renvoie de 404 ni de 500.** Les 3 sujets « à 0 » (`education-artistique`, `sciences-informatique-matiere`) sont bien présents en base.

---

## 1. ⚠️ 3 liens : la page annonce plus que ce qu'on peut consulter

| Lien | A (affiché) | B (listable) | C (/fr/ressources) |
|---|---|---|---|
| `/fr/devoirs/anglais?cycle=lycee` | 274 | **273** | 274 |
| `/fr/devoirs/mathematiques?cycle=lycee` | 2881 | **2874** | 274→2881 |
| `/fr/devoirs/physique?cycle=lycee` | 2726 | **2722** | 2726 |

**Cause** : l'API `/api/devoirs/[slug]/list` applique un filtre de sanitation que le hero ne compte pas :

```sql
-- « Global sanity: homeworkNumber must be 1-20 (teacher typos filtered out) »
(r.homeworkNumber IS NULL OR (r.homeworkNumber BETWEEN 1 AND 20))
```

Les 12 ressources concernées ont un `homeworkNumber` hors bornes (0, >20, …) : elles sont **comptées par la page mais jamais listées** → l'utilisateur ne peut pas y accéder en scrolling. Vérifié en base : `typos = 1 / 7 / 4`.

Le même filtre **n'existe pas** dans `/api/series/list` ni `/api/cours/list` → d'où le fait que seuls 3 liens (tous en `devoirs`) soient touchés.

**✅ Corrigé** (branche `fix/megamenu-counts-and-empty-links`, validé sur dev `92d6c7e0`) : le hero de la page `devoirs` applique désormais le même filtre que son listing → le nombre affiché = le nombre consultable. Le filtre n'est **pas** ajouté aux pages series/cours (sinon on créait l'écart inverse).

**Précision importante** : après correction, la page `/fr/devoirs/anglais?cycle=lycee` affiche **273** et en liste 273 ✅, alors que `/fr/ressources?subject=anglais&…` affiche et liste **274**. Cet écart est **légitime** : la ressource fautive (`id=8067`, `homeworkNumber=2013` — l'enseignant a mis l'**année** dans le champ « numéro de devoir ») **est** listable sur `/fr/ressources` (retrouvée page 5) mais **pas** sur la page devoirs. Chaque page est cohérente avec ce qu'elle affiche ; le comparatif `/fr/ressources` reste le bon ordre de grandeur.

## 2. ⚠️ 2 liens : compte figé en meta description

| Page | Texte annoncé | Base réelle |
|---|---|---|
| `/fr/matieres/mathematiques` | « 📐 **+8600** ressources » (×2 : meta + FAQ) | **6 740** |
| `/fr/matieres/physique` | « ⚛️ **+3000** ressources » | 4 253 |

Le compte venait de `src/lib/subjects.config.ts` (chaîne **statique**), pas de la base. Le code calcule bien `totalCount` en live mais ne l'utilise que comme *fallback* (`cfg?.seo?.descriptionFr || …`).

Maths **sur-promet de 1860** (c'est le pire cas : Google compare la meta description au contenu réel, et l'utilisateur compte les cartes). Physique sous-promet (inoffensif, mais faux).

**✅ Corrigé** : le nombre est devenu le placeholder `{count}` dans la config, interpolé par `withLiveCount(text, count)` aux 3 points d'usage (meta description, intro du hero, réponses de FAQ). Vérifié sur dev : `+6740` (maths) et `+4253` (physique) — les deux correspondent à la base.

## 3. ⚠️ 33 liens mènent à une page vide (23 % du méga-menu)

Le menu génère **4 liens par matière** (`/matieres/{s}` + `/devoirs/{s}` + `/series/{s}` + `/cours/{s}`) sans regarder le contenu réel. Or beaucoup de matières n'ont du contenu que pour 1 ou 2 types.

Décomposition (base, publiés) :

| Matière | Cours | Devoirs | Séries |
|---|---|---|---|
| `education-islamique` | 0 | 50 (collège) | 0 |
| `education-civique` | 2 (collège) | 24 (collège) | 0 |
| `education-artistique` | 0 | 0 | 0 |
| `theatre` | 0 | 17 (collège) | 0 |
| `musique` | 6 (collège) | 5 (collège) | 0 |
| `histoire` / `geographie` | 0 | 4 / 3 (lycée) | 0 |
| `sport` | 0 | 1 (lycée) | 0 |
| `genie-electrique` | 1 (lycée) | 0 | 0 |

Les 33 liens concernés sont listés dans le CSV (statut `VIDE`).

**UX actuelle** : pas cassée — la page affiche « 0 SÉRIE », « 0 ressource » et « Aucun devoir pour ces filtres. Essayez d'élargir vos critères. » → c'est propre, mais le **menu adresse l'utilisateur vers du vide** (23 % des liens).

### Correctif recommandé (non appliqué — décision d'UX)

L'API `/api/matieres/list` renvoie déjà `resourceCount` par matière ; il suffit de l'étendre avec un détail **par type et par cycle** :

```json
{ "slug": "arabe", "counts": { "college": { "DEVOIR": 263, "EXERCISE": 0, "COURSE": 24 } } }
```

Puis, dans `MenuMatieresCollegeLycee` :
- **Option A (recommandée)** — n'afficher que les types qui existent pour le cycle actif + afficher le compte à côté (« Devoirs Arabe · 263 »). Zéro lien mort, et l'utilisateur sait quoi attendre avant de cliquer.
- **Option B** — garder tous les liens mais afficher « 0 » en grisé sur les types vides (le menu reste exhaustif, l'utilisateur voit que le contenu arrive).
- **Option C** — ne lister que les matières qui ont ≥ 1 ressource dans le cycle (retire aussi `education-artistique`).

Effet : 33 liens morts → 0 (A/B) ou 9 (C).

---

## 4. Vérifications complémentaires

- **Types de ressources en base** : `DEVOIR` 10 996 · `EXERCISE` 3 421 · `COURSE` 988 · `OTHER` 8 · `SUMMARY` 4 · `REVISION` 3 · `SERIE` 1.
  → `SERIE` (1 ressource) et `REVISION` (3) **ne sont visibles dans aucune page** : le menu/map ne couvre que DEVOIR/EXERCISE/COURSE. Non bloquant (volumes négligeables), mais à connaître.
- **Aucune ressource sans `classId`** (`sans_classe = 0` sur tous les sujets) → aucun hors-cycle fantôme.
- Les 33 liens vides ont été **re-vérifiés en 2ᵉ passe** (cache 60 s expiré) : toujours 0, aucun faux positif.
- Le menu est bien **scopé au panneau** : une 1ʳᵉ extraction non scopée polluait le relevé avec le bloc hero « Rechercher : Maths / Physique / SVT… » (ces liens-là ne sont pas des liens de méga-menu).

---

## 5. État après correction (dev `92d6c7e0`)

| Contrôle | Avant | Après |
|---|---|---|
| Liens en erreur HTTP | 0 | 0 |
| Écarts de cohérence (affiché ≠ listable) | 3 | **0** ✅ |
| Comptes figés en meta description | 2 | **0** ✅ |
| Liens vers une page vide | 33 | 33 *(inchangé — décision d'UX, cf. §3)* |

Releve complet : `output/docs/megamenu-counts-2026-10-26.csv` (141 lignes).
