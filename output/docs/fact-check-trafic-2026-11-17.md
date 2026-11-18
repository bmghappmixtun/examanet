# Fact-check — origine du pic de trafic du 17/11/2026 sur examanet.com

**Date de l'analyse :** 18/11/2026
**Objet :** vérifier la réponse de l'agent IA Cloudflare (collée par l'utilisateur) sur l'origine du trafic du 17/11, et recouper avec nos logs Workers / D1.
**Méthode :** API GraphQL Cloudflare (compte `59cffdeaadf3809cc3d2039c43f836e0`, niveau compte), API Observability Workers, mesures navigateur (Playwright) sur la prod réelle, logs D1.

---

## 1. Verdict global

**La conclusion de l'assistant Cloudflare est partiellement correcte, mais son diagnostic est faux sur les trois causes qu'il propose, et il passe à côté de la cause principale.**

| Affirmation de l'assistant | Verdict | Preuve |
|---|---|---|
| Le trafic a presque triplé le 17/11 | ✅ **Vrai** | 122 823 → **383 624** requêtes (+212 %) — mesuré exactement, pas via un sampling |
| « C'est du trafic automatisé / scraping » | ⚠️ **Vrai en surface, trompeur en cause** | Oui, il y a du bot — mais **un tiers du pic n'est pas du bot du tout** : c'est **notre propre service worker** |
| `/fr/recherche` = 8 749 requêtes ⇒ « scraping de la recherche » | ❌ **Faux** | 16 328 requêtes, dont **5 483 sont des 504** produits par le prefetch Cloudflare. Aucun scraping sur ce path |
| `/api/status/uptime` = 4 990 hits ⇒ « bots qui énumèrent les endpoints » | ❌ **Faux** | 10 912 hits, dont **44 % de sondes "early hints"**. Le reste = **notre propre badge de statut** (1 par page affichée) |
| « 45 % du trafic n'exécute pas de JavaScript ⇒ bots » | ⚠️ **Raisonnement bancal** | Le ratio RUM/HTTP est correct, mais il ne prouve rien sur la nature du trafic : les sondes d'edge ne sont pas des visiteurs du tout |
| Recommandation : « restreindre/protéger `/api/status/uptime` » | ❌ **A neuromaudit** | La route est le socle du badge + de la page `/statut`. La protéger casse notre propre supervision |
| Recommandation : « rate limiting sur `/fr/recherche` » | ⚠️ **Inefficace** | 30 % des hits sur ce path sont des sondes d'edge (`early hints`) qui ne touchent **jamais** notre Worker. Un rate-limit applicatif ne les voit pas |

**La vraie cause du pic, par ordre de poids :**

1. **≈ 27,5 % des requêtes du 17/11 sont des sondes de prefetch Cloudflare** (`nginx-ssl early hints`, `fl2 early hints`) — 105 360 requêtes. Elles ne touchent jamais notre Worker, ne consomment ni D1 ni CPU… mais **sont comptabilisées comme "HTTP requests"** et **génèrent 105 303 réponses 504**.
2. **≈ 10,8 % sont notre propre Service Worker** (41 248 requêtes sur des chemins que personne ne visite volontairement : `/fr/offline`, `/ar/offline`, `/offline`, `/sw.js`, `/manifest.json`, `/icon-*.png`, `/favicon.ico`).
3. **Le reste (~60 %) est bien du trafic automatisé** — et là l'assistant a raison sur le fond.

---

## 2. Les chiffres exacts

### 2.1 Volume par jour (agrégat GraphQL filtré, comptage exact)

| Jour | Requêtes | 504 | early hints | RUM (JS exécuté) | TN |
|---|---|---|---|---|---|
| 15/11 | 53 218 | 12 441 | 12 442 | 1 075 | — |
| 16/11 | 122 823 | 34 135 | 34 138 | 3 616 | 79 661 (64,9 %) |
| **17/11** | **383 624** | **105 303** | **105 360** | 8 045 | 42 553 (11,1 %) |
| 18/11 | 126 912 | 35 668 | 33 386 | 2 634 | — |

> Les 504 correspondent **exactement** aux sondes `early hints` (105 303 vs 105 360). Ce ne sont pas des erreurs de notre application : ce sont des prefetches d'edge qui expirent.

### 2.2 La bascule du 17/11

La Tunisie s'effondre (64,9 % → 11,1 %) pendant que les États-Unis passent de 11,5 % à 18,8 %. **Ce n'est pas une perte d'audience tunisienne** : c'est une invasion de trafic étranger.

**Signature d'un UA spoofé** — le premier UA du 17/11 (`Chrome/146.0.0.0`) :

```
total = 86 983 requêtes  •  105 pays distincts
top pays : US:19 465  SG:11 354  FR:11 046  PK:4 679  AR:4 296  BD:3 880
```

Un Chrome 146 (version d'octobre 2025) qui produit **19 465 requêtes depuis les US**, **11 354 depuis Singapour** et **4 679 au Pakistan**, avec une distribution *rigoureusement proportionnelle* entre les pays — c'est la signature d'une **ferme de proxies avec UA spoofsé**, pas d'un navigateur. Le même ratio `US:SG:FR:PK:AR:BD` se retrouve à l'identique sur le UA `nginx-ssl early hints` (`US:16 235 SG:7 851 FR:7 765 PK:5 849 AR:5 700`) : **les deux populations partagent la même infrastructure**.

### 2.3 Ce qui est réellement du scraping

| Path | Requêtes | Dont `early hints` | Dont 504 | Bots explicites |
|---|---|---|---|---|
| `/fr/recherche` | 16 328 | 5 021 (31 %) | 5 483 | MJ12bot 2 566 · Lightpanda 626 |
| `/api/status/uptime` | 10 912 | 4 859 (44 %) | — | — (le reste = notre badge) |
| `/fr` | 17 226 | 3 933 | — | Examanet-UptimeCheck 1 618 · UptimeRobot 558 |

Les deux seuls bots qui font du **vrai** travail de scraping sont **MJ12bot** (2 566 hits sur `/fr/recherche`) et **Lightpanda** (626). Tout le reste du pic est du bruit.

---

## 3. La cause racine côté code : la boucle de rechargement du Service Worker

C'est la découverte majeure de cette analyse, et elle est **de notre faute**.

### 3.1 Le mécanisme

`public/sw.js` appelle `self.clients.claim()` dans son handler `activate`. À la **première installation** du SW, `claim()` prend le contrôle de la page ouverte → l'événement `controllerchange` se déclenche → `ServiceWorkerRegister.tsx` faisait :

```js
navigator.serviceWorker.addEventListener('controllerchange', () => {
  if (refreshing) return;
  refreshing = true;
  window.location.reload();   // ← se déclenche aussi à la PREMIÈRE installation
});
```

**La page se recharge donc systématiquement à la première visite.** Et comme `reg.update()` est appelé à chaque chargement avec `updateViaCache: 'none'`, le cycle recommence à chaque réinstallation du SW (donc à chaque déploiement).

### 3.2 La mesure (navigateur réel, prod, profil neuf)

| | Avant | Après correctif (dev) |
|---|---|---|
| Requêtes `document` (1re visite) | **2** | **1** |
| Appels `/api/status/uptime` | **2** | **1** |
| Requêtes totales (1re visite) | **93** | **40** |
| Même profil, 2e visite | 47 | 44 |

### 3.3 Pourquoi c'est un multiplicateur de trafic

Les bots n'envoient **pas de cookie persistant**. Chaque requête d'un bot est donc une « première visite » ⇒ chaque requête de bot déclenche : le precache SW (7 URLs) + un rechargement complet de la page + tous ses RSC prefetch.

**Effet mesuré sur la prod (17/11) :**

```
/fr/offline      8 416      /ar/offline     5 258      /offline      5 426
/sw.js           8 883      /manifest.json  3 450      /icon-192.png 2 658
/icon-512.png    2 621      /favicon.ico    4 536
─────────────────────────────────────────────────────────────────────────
TOTAL SW       41 248 requêtes = 10,8 % du trafic de la journée
```

Et `/fr/offline` est passé de **332** (15/11) à **8 416** (17/11) — un facteur 25, exactement proportionnel à la montée du trafic bot. **C'est la trace du multiplicateur SW dans les logs Cloudflare.**

### 3.4 Le lien causal avec la saturation D1

La saturation D1 (« Too many resources consumed within a 10 second window ») est un **budget CPU du compte**, pas de la base. Elle est donc proportionnelle au nombre de requêtes hitting le Worker. Pic de trafic = pic de CPU = saturation.

Chronologie recoupée (17/11) :

```
17h00  43 661 req/h   ← montée
18h00  77 621 req/h   ← 18h34 : 1er D1_ERROR "D1 DB is overloaded"
19h00  89 855 req/h   ← 19h14-19h37 : pic d'erreurs D1 (73 événements observés)
20h00   5 468 req/h   ← le trafic retombe, la saturation s'arrête
```

Les erreurs ne sont **pas** aléatoires : ce sont `[search/suggest]`, `[search-v2-d1]`, `[detail]` — c'est-à-dire les routes qui interrogent D1. **La saturation D1 est la conséquence directe du pic de trafic**, pas une panne autonome.

---

## 4. Correctifs apportés

Branche `fix/niveaux-undefined-and-status-doublefetch` (2 commits), déployés et validés sur **dev** (`examanet-dev`, version `ec029458`).

### 4.1 `/niveaux/undefined` — URL cassée + JSON-LD pollué

**Cause :** l'API `/api/ressources/[id]/detail` exposait `level` à la racine mais **pas dans `class`**. Or `ResourceDetailClient` lit `resource.class.level?.slug`. Résultat : slug `undefined` → URL `/niveaux/undefined` (fil d'Ariane cassé, 404) et `BreadcrumbList` JSON-LD avec `"https://examanet.com/niveaux/undefined?class=9eme"`.

**Correctif :** l'API expose désormais `level` **dans** `class` (en plus de la racine, pour compat), et le client retombe sur `resource.level` avec garde-fou.

**Vérifié sur dev :**
```
id=3562 -> class.level = {"slug":"college", …}
id=93   -> class.level = {"slug":"lycee",   …}
JSON-LD contenant "niveaux/undefined" : 0
hrefs /niveaux : ["/fr/niveaux","/fr/niveaux/college","/fr/niveaux"]
```

### 4.2 Double polling `/api/status/uptime`

**Cause :** le badge (pied de page) et le panneau (`/statut`) appelaient chacun la route en direct, et chaque composant était monté 2 fois ⇒ **2 appels par page, 4 sur `/statut`**.

**Correctif :** nouveau module `src/components/status/useServiceStatus.ts` — promesse partagée + cache de 45 s, filtre `examanetMonitors` centralisé.

**Vérifié :** `/fr` → 1 appel au lieu de 2 ; `/fr/statut` → 2 au lieu de 4.

### 4.3 Boucle de rechargement du Service Worker

**Correctif :** on ne recharge que si un contrôleur existait déjà avant l'enregistrement (donc une **vraie mise à jour**), pas à la première installation.

### 4.4 Precache SW réduit (10 → 7 URLs)

`'/'`, `'/fr'` et `'/ar'` sortent du precache : ces pages sont visitées par l'utilisateur, le précache n'y créait que 3 requêtes supplémentaires à chaque réinstallation du SW.

---

## 5. Ce qu'il reste à faire (non fait — décision requise)

Ces points sont **recommandés, pas exécutés** : ils touchent la configuration Cloudflare de la zone, hors du flux code.

### 5.1 Neutraliser le prefetch `early hints` (gain le plus élevé)

Les sondes d'edge produisent **105 303 réponses 504** le 17/11 et gonflent artificiellement le compteur « HTTP requests ». Elles ne touchent jamais notre Worker (0 occurrence dans les 1 500 événements Observability échantillonnés sur la journée), donc **protéger notre Worker ne les arrêtera pas**.

Options, par ordre de préférence :
1. **Réactiver Speed Brain / prefetch avec une règle de Speculation Rules restreinte** au lieu du prefetch `/*` (actuellement tout est précaché).
2. Désactiver `early_hints` sur la zone.
3. Accepter — si on préfère ne pas toucher à l'edge, le coût réel est nul (seul le compteur est gonflé).

### 5.2 Rate limiting sur `/fr/recherche`

À poser **au niveau WAF/edge**, pas dans le Worker : 30 % des hits sur ce path sont des sondes d'edge que le code applicatif ne voit jamais.

### 5.3 Bloquer les UA spoofés

Le pattern `Chrome/146.0.0.0` avec 105 pays et une distribution proportionnelle est facile à cirer : un seul UA qui dépasse N requêtes avec > M pays distincts. Une règle WAF sur ce motifbloquerait la majorité du pic.

### 5.4 Surveiller `/api/status/uptime`

La route est publique par conception (elle alimente le badge et la page `/statut`). **Ne pas la protéger** sans alternative — l'assistant Cloudflare a proposé exactement cela, ce qui aurait cassé notre supervision.

---

## 6. Résumé pour décision

- **Ce que l'assistant Cloudflare a bien vu :** le trafic a triplé, et l'essentiel est automatisé avec des UA spoofés et une distribution géographique anormale.
- **Ce qu'il a raté :** le tiers du pic est auto-infligé (Service Worker + prefetch edge), et les deux « preuves » qu'il a brandies (`/api/status/uptime`, `/fr/recherche`) sont en réalité nos propres requêtes et des sondes d'edge — pas du scraping.
- **Ce qu'il a proposé et qu'il ne faut pas faire :** restreindre `/api/status/uptime` (ça casse la supervision) et rate-limiter `/fr/recherche` dans le Worker (inefficace contre des sondes d'edge).
- **Ce qui est corrigé et prêt à merger :** `/niveaux/undefined`, le double polling, la boucle de reload SW, le precache. Validé sur dev.

---

## 7. Scripts de reproduction

```bash
node scripts/verify-traffic-sw-precache-2026-11-17.mjs    # comptes exacts des chemins SW
node scripts/verify-traffic-sw-impact-2026-11-17.mjs      # part du trafic imputable au SW
node scripts/verify-traffic-rum-earlyhints-2026-11-17.mjs # RUM vs sondes early hints
```

> Note technique : les agrégats GraphQL doivent **toujours** être filtrés par chemin puis regroupés sur `edgeResponseStatus`. Un grouping par `clientRequestPath` est tronqué/sélectionné par Cloudflare et les totaux ne correspondent pas au total réel.
