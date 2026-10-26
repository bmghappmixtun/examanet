# Hydratation — le #418/#422 de `/admin/invitations` (2026-10-26)

## Déclencheur

En auditant le méga-menu (déployé en prod le 2026-10-26), l'endpoint `session-start` a signalé **2 groupes d'erreurs nouveaux** dans les 24 h :

| Heure (UTC) | Page | Erreur | Source |
|---|---|---|---|
| 2026-10-26 20:26:13 | `https://examanet.com/admin/invitations` | React **#418** | CLIENT |
| 2026-10-26 20:26:14 | `https://examanet.com/admin/invitations` | React **#422** | CLIENT |

- User-Agent : `Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:158.0) Gecko/20100101 Firefox/158.0` → **un vrai navigateur, pas l'automatisation** (Playwright = Chromium).
- Stack : **aucune frame applicative** (que `react-dom` `fd9d1056-*.js` + le router app-router `2117-*.js`) → même signature que le groupe #425/#422 chassé depuis le 2026-10-24.
- Page concernée : **`/admin/invitations`**, une page admin **jamais auditée** (les audits portaient sur `/fr/ressources/3562`).

> Rappel React 18.3 (app router) : #418 = mismatch **structurel** (le DOM hydraté ne correspond pas au HTML serveur) → React bascule tout le root en rendu client. #422 = la récupération de l'hydratation échoue.

## Le suspect : `Date.now()` appelé pendant le rendu

`src/components/admin/InvitationsClient.tsx` calculait le badge « ⚠️ expire bientôt » **pendant le rendu** :

```tsx
const isExpiringSoon =
  expiresAt &&
  expiresAt.getTime() > 0 &&
  inv.status !== 'ACTIVATED' && inv.status !== 'EXPIRED' && inv.status !== 'CANCELLED' &&
  expiresAt.getTime() - Date.now() < 2 * 24 * 3600 * 1000;   // ← Date.now() au rendu
```

Le serveur et le client n'appellent donc **pas la même horloge** : le flag peut basculer entre le HTML serveur et l'hydratation.

Historique accablant : cette page a déjà été « corrigée » **deux fois** —
`bab7f1d6` (2026-07-31) et `f7f58a2d` (2026-08-01) — en utilisant `suppressHydrationWarning` et en stabilisant le **nombre d'enfants** du `<div>`. Les erreurs sont **revenues** (31/07, 01/08, 26/10) : la suppression d'avertissement **masquait** le symptôme, elle ne supprimait pas la divergence.

## Preuve : banc de test A/B en mode dev

`src/app/[locale]/repro-hydration-test/page.tsx` rend le **vrai** `InvitationsClient` avec des données mockées calibrées pour forcer le basculement (`expiresAt = maintenant + 2 j + 400 ms`). En dev, React non minifié **nomme le composant et l'élément** :

```
SANS renderedAt (Date.now() au rendu)
  → 1 message : Prop `className` did not match. Server: "hidden" Client: ""
    at span → at div → at td → at tr → at tbody → at table
    at InvitationsClient (src/components/admin/InvitationsClient.tsx:218)

AVEC renderedAt (déterministe)
  → 0 message
```

👉 Le mismatch est **exactement** sur le `<span>` du flag `isExpiringSoon`, dans le vrai composant.

## Correctif : le serveur transmet son horodatage

Le serveur rend avec `Date.now()` **figé** et le sérialise dans le payload RSC → le client hydrate avec **la même valeur** → le flag est identique des deux côtés, sans flash ni `useEffect`.

| Fichier | Changement |
|---|---|
| `src/lib/utils.ts` | `timeAgo(date, now = Date.now())` — `now` injectable |
| `src/components/admin/InvitationsClient.tsx` | prop `renderedAt` ; `isExpiringSoon` calculé dessus |
| `src/app/admin/invitations/page.tsx` | passe `renderedAt={Date.now()}` |
| `src/components/admin/MessagesClient.tsx` | prop `renderedAt` ; `timeAgo(ms, now)` |
| `src/app/admin/messages/page.tsx` | passe `renderedAt={Date.now()}` |
| `src/components/admin/PendingEditsClient.tsx` | prop `renderedAt` ; `timeAgo(ms, now)` |
| `src/app/admin/ressources/editions/page.tsx` | passe `renderedAt={Date.now()}` |

Repli `renderedAt ?? Date.now()` conservé partout : si la prop est absente, on retombe sur l'ancien comportement (jamais en SSR).

## Le même vice ailleurs (corrigé au passage)

`grep -rn "Date.now()" src --include="*.tsx"` → 4 rendus dépendants du temps :

| Composant | Verdict |
|---|---|
| `InvitationsClient` | **corrigé** (mismatch prouvé) |
| `MessagesClient`, `PendingEditsClient` | **corrigé** (texte relatif, mismatch silencieux en prod) |
| `AcceptInvitationClient` (page **publique** `/invitation/[token]`) | **sûr** : les données arrivent en `useEffect` → `info = null` au premier rendu, des deux côtés. `daysLeft` n'est jamais calculé pendant l'hydratation. (Mais il lit `window.location` au rendu → code mort, à supprimer.) |
| `TeacherJourneyTimeline` | **sûr** : données chargées en `useEffect`. Son parent `VerificationsClient` utilise déjà le bon pattern (`now` null au montage). |
| `CommentsSection` | **déjà corrigé** en amont (pattern de référence : libellé cuit serveur + recalcul en `useEffect`) |

## Reste à élucider

Le mismatch d'**attribut** (`className` du `<span>) ne suffit pas à expliquer un #418 en prod (React 18.3 ne throw pas sur un écart d'attribut : il patche silencieusement). Le déclencheur structurel exact du #418 du 2026-10-26 reste donc **non reproduit** : il faudrait rejouer la vraie page `/admin/invitations` ( authentification admin + données réelles) en mode dev.

**Banc de test livré** : `scripts/repro-admin-invitations-hydration.cjs` + la page `_repro` (404 en build/prod via `notFound()`), pour les prochaines investigations de la famille #418/#422.

## Vérifications

- `tsc --noEmit` : **0 erreur** sur les 7 fichiers touchés (114 restantes = préexistantes).
- Build CF + deploy dev `fb4ea2c9` : OK.
- Pages `/fr`, `/fr/matieres`, `/fr/devoirs/anglais`, `/fr/classes` : **200**.
- `/api/matieres/list` : 28 matières, `counts` + `totalByCycle` sur les 28 → intact.
