# ⚡ Setup Rapide — 3 minutes chrono

## Option 1 : Avec Neon (gratuit, recommandé) ⭐

### 1. Créer la base Neon
- Va sur **https://neon.tech** → Sign up gratuit
- Crée un projet → Région **Frankfurt** (Europe, proche de la Tunisie)
- Copie l'URL de connexion (PostgreSQL)

### 2. Configurer le projet
```bash
# Crée ton .env à partir du modèle
cp .env.example .env

# Colle ton URL Neon dans DATABASE_URL, exemple :
# DATABASE_URL="postgresql://user:pass@ep-xxx.eu-central-1.aws.neon.tech/examanet?sslmode=require"

# Ajoute un NEXTAUTH_SECRET aléatoire :
# NEXTAUTH_SECRET="colle-ici-32-caracteres-aleatoires"
```

### 3. Initialiser la base
```bash
npm install
npm run setup     # Génère Prisma + push schema + seed
```

### 4. Lancer
```bash
npm run dev
```

→ **http://localhost:3000** 🚀

### 5. Tester les comptes
| Rôle | Email | Mot de passe |
|------|-------|-------------|
| Admin | `admin@examanet.com` | `demo1234` |
| Enseignant | `ahmed.benali@examanet.com` | `demo1234` |
| Élève | `yassine@example.com` | `demo1234` |

---

## Option 2 : Avec Docker (PostgreSQL local)

```bash
# Démarre PostgreSQL
docker compose up -d postgres

# Setup
npm install
npm run setup

# Dev
npm run dev
```

---

## 🚀 Déployer sur Vercel

Voir **[DEPLOY_VERCEL.md](./DEPLOY_VERCEL.md)** pour le guide complet.

TL;DR :
1. Push le code sur GitHub
2. Connecte le repo à Vercel
3. Ajoute `DATABASE_URL` (Neon) + `NEXTAUTH_SECRET` + `BLOB_READ_WRITE_TOKEN`
4. Deploy 🚀

---

## ❓ Problèmes ?

### "Can't reach database"
→ Vérifie que `DATABASE_URL` est correcte et que ta DB Neon est bien "Active"

### "Port 5432 already in use"
→ Docker : `docker compose down` puis `docker compose up -d postgres`

### "Module not found"
→ `rm -rf node_modules .next && npm install`

### "OTP ne s'envoie pas"
→ En dev, l'OTP s'affiche dans la console du serveur (cherche `[EMAIL]`)
