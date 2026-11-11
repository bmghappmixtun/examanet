# Bandeau matière → card (page matière + page liste) — 2026-11-11

## Demande
Transformer le bandeau « matière » (page `/[locale]/matieres/[subject]`) et son équivalent
sur la page liste `/[locale]/matieres` en **card** : coins arrondis, bordure, ombre.

## Fichiers modifiés
| Fichier | Modif |
|---|---|
| `src/components/subjects/SubjectHero.tsx` | bandeau détail → card (`rounded-3xl` + `border` + ombre colorée) + correctif mobile + `mb-8` |
| `src/components/matieres/MatieresListClient.tsx` | bandeau liste → card (mêmes tokens visuels) |

## Ce qui a changé visuellement
- **Card** : `rounded-3xl` (24px) + bordure teintée à la couleur de la matière + ombre portée
  colorée `0 18px 40px -26px <couleur matière>` (la decoration devient « posée » sur le fond).
- Le dégradé interne et le motif SVG filigrane sont **conservés** à l'identique.
- Padding interne harmonisé (`px-6 sm:px-10 lg:px-14`) sur les deux pages.
- Respiration ajoutée sous la card du détail (`mb-8`) : elle touchait les 3 cartes
  « DEVOIRS / COURS / SÉRIES ».

## Bug mobile corrigé au passage (préexistant)
Sur mobile (390px), le titre de la matière était **coupé** (« Mathématiq… ») et le nom arabe
l'était aussi : le bloc texte (`flex-1`) ne pouvait pas rétrécir → il débordait sous `overflow-hidden`.

Correctifs :
- `flex-1` → `flex-1 min-w-0` (autorise la réduction) ;
- icône `w-20 h-20` → `w-14 h-14 sm:w-20 sm:h-20` + `shrink-0` + emoji `text-3xl sm:text-5xl` ;
- titre `text-4xl` → `text-3xl sm:text-4xl lg:text-5xl` + `break-words` ;
- nom arabe `text-xl` → `text-base sm:text-xl` ;
- gap `gap-5` → `gap-4 sm:gap-5`.

Le **desktop est inchangé** (les overrides sont en `sm:`/`lg:`).

## Vérification (dev `examanet-dev`)
Worker : `75b31de6-d379-4134-bf55-cb0a97d81b5b`

| Page | viewport | `scrollW` | débordement | erreurs console |
|---|---|---|---|---|
| `/fr/matieres/mathematiques` | 1440×900 | 1440 = vw | non | 0 |
| `/fr/matieres/mathematiques` | 390 (mobile) | 390 = vw | non | 0 |
| `/fr/matieres` | 1440×900 | 1440 = vw | non | 0 |
| `/ar/matieres/mathematiques` | 1440×900 | 1440 = vw | non | 0 |

Sur mobile, les seuls éléments hors cadre restants sont les 2 blobs décoratifs
(`absolute -top-20` / `-bottom-16`), volontairement clippés par `overflow-hidden`.

Captures : `output/screenshots/matiere-card-detail-{desktop,mobile,ar}.png`,
`output/screenshots/matiere-card-liste-desktop.png`.

## Outil
`scripts/shot-page.cjs` — capture viewport (et non full-page : les sections `data-reveal`
restent invisibles sans scroll) + contrôle de débordement horizontal + erreurs console.
Nom sans préfixe `check-`/`extract-` car `.gitignore` exclut ces motifs.

## Reste à faire
- **Validation utilisateur sur dev** puis merge `main` → prod.
- Observation hors périmètre : sur `/ar/matieres/...`, le `<h1>` affiche encore le nom
  **français** (le nom arabe est en dessous). Comportement préexistant, non modifié ici.
