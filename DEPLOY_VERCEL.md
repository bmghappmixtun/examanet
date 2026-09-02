# 🚀 Guide de Déploiement Vercel — Examanet

> **5 minutes chrono** pour mettre en ligne ta plateforme sur Vercel

---

## 📋 Pré-requis

- ✅ Un compte Vercel (gratuit) — https://vercel.com/signup
- ✅ Git installé sur ton PC
- ✅ Un compte GitHub (gratuit) — https://github.com

---

## 🎯 Étape 1 : Créer une base PostgreSQL gratuite

Tu as **3 options** au choix (toutes gratuites) :

### Option A : Neon (recommandé) ⭐
1. Va sur https://neon.tech → Sign up
2. Crée un nouveau projet
3. Choisis la région **Frankfurt** (proche de la Tunisie)
4. Copie la **Connection String** (ressemble à : `postgresql://user:pass@ep-xxx.eu-central-1.aws.neon.tech/examanet?sslmode=require`)

### Option B : Supabase
1. Va sur https://supabase.com → New Project
2. Choisis région **Frankfurt**
3. Va dans **Project Settings → Database → Connection String → URI**

### Option C : Vercel Postgres
1. Dans Vercel, va dans l'onglet **Storage** → **Create Database** → **Postgres**
2. Connecte-le à ton projet

---

## 🎯 Étape 2 : Pousser le code sur GitHub

Ouvre un terminal dans le dossier `edutunisie` :

```bash
# Initialiser git (si pas déjà fait)
git init
git add .
git commit -m "Initial commit - Examanet platform"

# Créer un repo sur GitHub (via l'interface web ou gh CLI)
# Puis :
git remote add origin https://github.com/TON-USER/edutunisie.git
git branch -M main
git push -u origin main
```

---

## 🎯 Étape 3 : Déployer sur Vercel

1. **Connecte-toi** sur https://vercel.com
2. Clique sur **"Add New Project"**
3. **Importe** ton repo `edutunisie` depuis GitHub
4. Vercel détecte automatiquement que c'est un projet Next.js
5. **NE CLIQUE PAS ENCORE SUR "Deploy"** — il faut ajouter les variables d'environnement

---

## 🎯 Étape 4 : Configurer les variables d'environnement

Dans la page de config Vercel, descends jusqu'à **"Environment Variables"** :

| Variable | Valeur | Où la trouver |
|----------|--------|---------------|
| `DATABASE_URL` | `postgresql://user:pass@...` | L'URL de Neon/Supabase (étape 1) |
| `NEXTAUTH_URL` | `https://ton-projet.vercel.app` | Vercel te donne l'URL après deploy |
| `NEXTAUTH_SECRET` | Une chaîne aléatoire de 32+ caractères | Génère avec : `openssl rand -base64 32` |
| `BLOB_READ_WRITE_TOKEN` | Token Vercel Blob | Vercel → Storage → Create Blob |

### Activer Vercel Blob (pour les uploads PDF)
1. Dans Vercel, va dans **Storage** → **Create Database** → **Blob**
2. Lie-le à ton projet
3. Le token est ajouté automatiquement aux env vars

---

## 🎯 Étape 5 : Deploy ! 🚀

1. Clique sur **"Deploy"**
2. Attends 2-3 minutes pendant le build
3. 🎉 Ton site est en ligne sur `https://examanet-xxx.vercel.app`

---

## 🎯 Étape 6 : Peupler la base de données

Une fois déployé, tu dois ajouter les données de démo :

### Méthode automatique via Vercel CLI

```bash
# Installe Vercel CLI
npm i -g vercel

# Login
vercel login

# Lien avec ton projet
vercel link

# Récupère les env vars localement
vercel env pull .env.production

# Lance le seed sur la base prod
DATABASE_URL="postgresql://..." npx tsx scripts/postgres-seed.ts
```

### Méthode manuelle via Neon/Supabase
1. Va dans l'interface web de Neon/Supabase
2. Ouvre le **SQL Editor**
3. (Le seed complet est long — utilise plutôt la méthode CLI)

---

## 🎯 Étape 7 : Custom Domain (optionnel)

Tu veux `www.examanet.com` au lieu de `examanet-xxx.vercel.app` ?

1. Achète le domaine (Namecheap, OVH, GoDaddy...)
2. Dans Vercel → **Settings** → **Domains** → **Add**
3. Ajoute les DNS records indiqués

---

## ✅ Checklist de vérification post-deploy

- [ ] Le site se charge sur l'URL Vercel
- [ ] Tu peux te connecter avec `admin@examanet.com` / `demo1234`
- [ ] Les ressources s'affichent (sinon lance le seed)
- [ ] Tu peux uploader un PDF (teste avec un compte enseignant)
- [ ] Le partage social fonctionne (teste le bouton "Partager")

---

## 🐛 Problèmes courants

### "Build failed: Can't reach database"
→ Vérifie que `DATABASE_URL` est bien configurée et que la DB est accessible publiquement

### "Module not found: @prisma/client"
→ Vercel buildCommand est dans vercel.json : `prisma generate && next build` ✓

### "BLOB_READ_WRITE_TOKEN is not defined"
→ Active Vercel Blob dans Storage

### "OTP ne s'envoie pas"
→ C'est normal en dev : l'OTP s'affiche dans les **logs Vercel** (Function logs)
→ Pour de vrais emails en prod, configure Resend (https://resend.com)

---

## 💰 Coûts

- **Vercel** : Gratuit jusqu'à 100 GB bande passante/mois (largement suffisant)
- **Vercel Postgres** : Gratuit jusqu'à 256 MB (suffisant pour démarrer)
- **Vercel Blob** : Gratuit jusqu'à 500 MB stockage
- **Neon** : Gratuit jusqu'à 0.5 GB
- **Supabase** : Gratuit jusqu'à 500 MB

**Total : 0 €/mois** pour démarrer 🚀

---

## 🔄 Mise à jour du site

À chaque fois que tu push sur GitHub :
```bash
git add .
git commit -m "Update feature X"
git push
```
→ Vercel redéploie automatiquement en 1-2 minutes ✨

---

## 🆘 Besoin d'aide ?

- **Logs** : Vercel → ton projet → **Logs** (en cas de bug)
- **Settings** : Vercel → ton projet → **Settings** (env vars, domains, etc.)
- **Analytics** : Vercel → ton projet → **Analytics** (gratuit)

---

**Bon deploy !** 🎉🇹🇳
