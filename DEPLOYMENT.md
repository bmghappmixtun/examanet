# Examanet — Plateforme pédagogique tunisienne

> Successeur moderne de devoirat.net — Cours, devoirs, séries et corrigés gratuits

## 🚀 Lancement rapide (local)

```bash
npm install
docker compose up -d postgres    # Lance PostgreSQL
cp .env.example .env
npx prisma db push
npx tsx scripts/postgres-seed.ts
npm run dev
```

→ http://localhost:3000

## 🔑 Comptes de démo

| Rôle | Email | Mot de passe |
|------|-------|-------------|
| Admin | `admin@examanet.com` | `demo1234` |
| Enseignant | `ahmed.benali@examanet.com` | `demo1234` |
| Élève | `yassine@example.com` | `demo1234` |

## 📦 Stack

- **Next.js 14** (App Router) + TypeScript
- **PostgreSQL** + Prisma ORM
- **Vercel Blob** pour les uploads
- **Tailwind CSS** + Lucide icons
- **bcrypt** + sessions JWT pour l'auth

## 🌐 Déploiement

Voir **[DEPLOY_VERCEL.md](./DEPLOY_VERCEL.md)** pour le guide complet de déploiement sur Vercel (gratuit).

## 📁 Structure

```
edutunisie/
├── prisma/                  # Schema Prisma + seeds
├── scripts/                 # Scripts utilitaires
├── src/
│   ├── app/                # Pages (App Router) + API
│   ├── components/         # Composants React
│   └── lib/                # Utilitaires, auth, storage
├── public/                 # Fichiers statiques
├── docker-compose.yml      # PostgreSQL pour dev
├── Dockerfile              # Image de production
└── vercel.json             # Config Vercel
```

## 🔧 Commandes

```bash
npm run dev          # Dev server
npm run build        # Build production
npm run start        # Lancer en prod
npm run db:push      # Sync schema → DB
npm run db:seed      # Seed SQLite (legacy)
npx tsx scripts/postgres-seed.ts  # Seed PostgreSQL
```

## 🛡️ Rôles

- **VISITOR** : Peut télécharger sans compte
- **STUDENT** : Favoris, commentaires, avis
- **TEACHER** : Upload (avec approbation admin)
- **ADMIN** : Accès total, modération, statistiques

## 📜 License

© 2024 Examanet — Tous droits réservés
