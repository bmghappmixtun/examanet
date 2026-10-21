# DNS à ajouter pour l'expéditeur par site (invitation profs)

**Objectif** : l'email d'invitation part de l'adresse du site d'origine du prof.

| Site source | Expéditeur | Statut DNS |
|---|---|---|
| `tunisiecollege.net` | `contact@tunisiecollege.net` | ⬜ à configurer |
| `devoirat.net` | `contact@devoirat.net` | 🟡 à moitié fait (DKIM OK, il manque le return-path) |

**Provider DNS** : Jimdo (`ns13.jimdo.com` / `ns14.jimdo.com`) — ⚠️ **pas** Cloudflare.
Seul `examanet.com` est sur Cloudflare, dans le compte du Worker.

---

## Pourquoi Resend et pas Cloudflare Email Service

Cloudflare a bien un service d'envoi outbound (`send_email` binding / REST API / SMTP),
mais il est inutilisable ici :

1. **Les zones sont sur Jimdo.** Pour onboarder un domaine dans Cloudflare Email Service,
   il faut que la zone soit dans un compte Cloudflare — donc migrer les NS de Jimdo vers
   Cloudflare, ce qui casse les sites Jimdo existants.
2. **Le compte du Worker ne contient que `examanet.com`.** La doc exige que le domaine
   d'envoi soit onboardé *sur le compte qui possède le token API*.
3. **Pas d'équivalent du tracking Resend.** Tout le pipeline de delivery tracking
   (`TeacherInvitation.resendMessageId`, `deliveryStatus`, `openCount`, `clickCount`)
   repose sur l'ID par message + les webhooks Resend.
4. **Envoi vers des destinataires arbitraires = Workers Paid** (les envois vers des
   adresses vérifiées sont gratuits, mais un prof invite est un destinataire externe).

**Resend ne demande AUCUNE modification du SPF racine** → pas de permerror SPF.

---

## Étape 1 — Ajouter les domaines dans Resend

<https://resend.com/domains> → *Add Domain* → `devoirat.net` puis `tunisiecollege.net`.

Resend affiche les enregistrements exacts à créer. **Copier-coller depuis le dashboard**,
les clés DKIM diffèrent d'un domaine à l'autre.

## Étape 2 — Créer les enregistrements DNS chez Jimdo

### Pour `devoirat.net`

| Type | Nom | Valeur | Priorité |
|---|---|---|---|
| TXT | `resend._domainkey` | `p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQC1XtU9Gz3yrSYrFiddLoF3GdnXDo2OL6UceLZgD/61RlISKULKjNIQ14hmWskqm9rNv7Ja1/n5sfbDLSMrURTQ1VXIKOIzGJGK6giKFaUvL45swt0+bSSPXiOXQtw3OQIwUYPbacxJt4meDONX/v/w44TPaHNzR90kfHxPeCYlcQIDAQAB` | — |
| MX | `send` | `feedback-smtp.us-east-1.amazonses.com.` | `10` |
| TXT | `send` | `v=spf1 include:amazonses.com ~all` | — |

> ☑️ Le DKIM est **déjà en place** (vérifié en DNS). Seul `send.devoirat.net` manque
> (NXDOMAIN) → c'est lui qui bloque la vérification Resend.
>
> ⚠️ Si Resend affiche plutôt **2 CNAME** (domaines créés après août 2026), utilisez
> `send.devoirat.net` et `rsend.devoirat.net` en CNAME, et **supprimez** le MX/TXT
> au-dessus. Un CNAME ne peut pas cohabiter avec d'autres enregistrements du même nom.

### Pour `tunisiecollege.net`

| Type | Nom | Valeur | Priorité |
|---|---|---|---|
| TXT | `resend._domainkey` | *clé DKIM affichée par Resend* | — |
| MX | `send` | `feedback-smtp.us-east-1.amazonses.com.` | `10` |
| TXT | `send` | `v=spf1 include:amazonses.com ~all` | — |

## Étape 3 — Ce qu'il ne faut PAS toucher

| Domaine | Enregistrement | Pourquoi on le laisse |
|---|---|---|
| `devoirat.net` | MX `mx1.jimdo.com` / `mx2.jimdo.com` | c'est la **réception** vers Jimdo |
| `devoirat.net` | TXT racine `v=spf1 include:sendgrid.net include:emailsrvr.com ~all` | l'envoi existant (formulaires Jimdo) |
| `tunisiecollege.net` | idem | idem |
| les 2 | `_dmarc` `p=none` | monitoring only, ne bloque rien |

Le SPF de Resend vit sur le **sous-domaine `send.`** → le SPF racine n'est jamais
touché, donc pas de permerror (plusieurs enregistrements SPF = échec).

## Étape 4 — Vérifier

Dans Resend, le domaine doit passer à **Verified**. Puis
<https://resend.com/domains> → status vert.

---

## ⚠️ Deux points d'attention

### 1. Les réponses
Le MX racine pointe vers Jimdo → une **réponse** à `contact@devoirat.net` arrive chez
Jimdo, pas chez Resend. Vérifie que la boîte `contact@` y est surveillée, sinon les
réponses des profs se perdent. (C'est un choix d'architecture, pas un bug.)

### 2. La reputation d'envoi
`devoirat.net` / `tunisiecollege.net` n'ont jamais envoyé d'email transactionnel.
Gmail peut mettre les premiers envois en **spam** ou « quarantine » même avec DMARC
`p=none` (qui ne fait que *monitoring*, pas *enforcement*).

Mitigation : les DMARC sont en `p=none`. Si un envoi se fait bloquer, passer en
`p=quarantine` (comme `examanet.com`) force une vérification stricte et améliore
la réputation à long terme.

---

## Côté code (déjà en place)

`src/lib/email-senders.ts` :
```ts
SITE_SENDER_DEFAULTS = {
  devoirat: 'contact@devoirat.net',
  tunisiecollege: 'contact@tunisiecollege.net',
}
```
Surchargeable sans rebuild via les vars Worker :
- `EMAIL_FROM_DEVOIRAT`
- `EMAIL_FROM_TUNISIECOLLEGE`
- `EMAIL_FROM` (fallback global)

**Fallback automatique** : si l'envoi avec l'expéditeur du site échoue (domaine pas
encore vérifié dans Resend), `sendEmailWithFrom` **rejoue l'envoi** avec
`noreply@examanet.com` → l'invitation n'est jamais perdue. La réponse de l'API
indique `usedFallbackSender: true`.

> ⚠️ Le fallback masque le problème : sans les DNS, les invitations continueront de
> partir, mais **de `noreply@examanet.com`**. Pour vérifier ce qui part vraiment,
> regarde la réponse de l'API (`from` + `usedFallbackSender`) ou le log Worker :
> `📧 [JOTFORM INVITATION] site=… from=… → …`
