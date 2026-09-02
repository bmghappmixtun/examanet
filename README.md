# 🎓 Examanet — Plateforme Pédagogique Tunisienne

> La plateforme éducative #1 en Tunisie — Cours, devoirs, séries, révisions, sujets Bac et corrigés gratuits.

---

## ✅ Ce qui est inclus

### Stack technique
- **Frontend** : Next.js 14 (App Router) + TypeScript + Tailwind CSS
- **Backend** : Routes API Next.js avec Prisma ORM
- **Base de données** : SQLite (dev) / PostgreSQL (prod)
- **Auth** : JWT sessions + OTP email
- **UI** : Composants custom style shadcn/ui

### Fonctionnalités complètes
- ✅ Landing page moderne avec hero, stats, filtres, newsletter
- ✅ Navigation par niveaux (Primaire / Collège / Lycée)
- ✅ Navigation par matières (16 matières)
- ✅ Liste de tous les professeurs
- ✅ Fiche ressource avec PDF viewer, actions, commentaires, avis ★
- ✅ Système d'engagement : favoris, commentaires, notes, partage social
- ✅ Inscription / Connexion (élève + enseignant)
- ✅ Dashboard élève : favoris, notifications, paramètres
- ✅ Dashboard enseignant : upload, gestion fichiers, stats
- ✅ Dashboard admin : gestion utilisateurs, approbations, modération
- ✅ Notifications in-app
- ✅ Recherche + filtres par type/matière/classe
- ✅ 24 ressources seeded avec données réalistes tunisiennes

---

## 🚀 Lancement rapide

```bash
cd edutunisie

# 1. Installer les dépendances
npm install

# 2. Générer Prisma + créer la DB + seed
npm run setup

# 3. Lancer le serveur de dev
npm run dev
```

Ouvrez http://localhost:3000

---

## 🔑 Comptes de démonstration

| Rôle | Email | Mot de passe |
|------|-------|-------------|
| **Admin** | admin@examanet.com | demo1234 |
| **Enseignant** | ahmed.benali@examanet.com | demo1234 |
| **Élève** | yassine@example.com | demo1234 |

---

## 📁 Structure du projet

```
edutunisie/
├── src/
│   ├── app/                    # Pages Next.js (App Router)
│   │   ├── api/               # API routes
│   │   ├── admin/             # Dashboard admin
│   │   ├── enseignant/        # Dashboard enseignant
│   │   ├── mon-compte/        # Dashboard élève
│   │   ├── connexion/         # Login
│   │   ├── inscription/       # Register
│   │   ├── ressources/       # Liste + fiche ressource
│   │   ├── niveaux/           # Navigation par niveau
│   │   ├── matieres/          # Navigation par matière
│   │   └── professeurs/       # Liste des profs
│   ├── components/           # Composants React
│   │   ├── layout/           # Header, Footer, menus
│   │   ├── resources/         # Cards, viewer, actions
│   │   └── admin/            # Composants admin
│   └── lib/                   # Utils, auth, prisma
├── prisma/
│   ├── schema.prisma          # 20+ modèles de données
│   └── seed.ts               # Données de démo tunisiennes
├── public/                    # Fichiers statiques
└── Dockerfile                # Container ready
```

---

## 🌐 Déploiement (Vercel — gratuit)

1. Poussez le code sur GitHub
2. Créez un projet sur [Vercel](https://vercel.com)
3. Connectez votre repo
4. Ajoutez les variables d'environnement :
   - `DATABASE_URL` → URL PostgreSQL (Supabase, Neon, Railway)
   - `NEXTAUTH_URL` → URL de votre site
   - `NEXTAUTH_SECRET` → Clé secrète aléatoire
5. Deploy !

Pour **supabase** :
```
DATABASE_URL="postgresql://user:password@host:5432/dbname"
```

---

## 🔧 Commandes utiles

```bash
npm run dev          # Dev server (port 3000)
npm run build        # Build production
npm run start        # Démarrer en prod
npm run db:studio    # Ouvrir Prisma Studio (GUI DB)
npm run db:push     # Sync schema → DB
npm run db:seed     # Réinsérer les données de demo
```

---

## 🏗️ Schéma de données (20 tables)

**Utilisateurs** : User, OtpCode, Session, Notification
**Taxonomie** : Level, Class, Section, Subject
**Ressources** : Resource (avec tous les compteurs)
**Engagement** : Comment, Rating, Favorite, View, Download, Share, Report
**Système** : Newsletter, Setting, AuditLog

---

## 🔐 Sécurité

- Mots de passe hashés (bcrypt)
- OTP 6 chiffres (expiration 10 min, max 5 tentatives)
- RBAC : VISITOR → STUDENT → TEACHER → ADMIN
- Sessions JWT httpOnly cookie
- Rate limiting sur les endpoints sensibles
- Validation Zod sur tous les formulaires

---

## 🎨 Design

- **Palette** : Sky/Cyan primary (`#0EA5E9`) + Amber accent (`#F59E0B`)
- **Typographie** : Inter
- **Style** : Glassmorphism, gradients doux, animations Tailwind
- **Responsive** : Mobile-first
- **Inspiration** : devoirat.net modernisé

---

**© 2024 Examanet** — Fait avec ❤️ en Tunisie 🇹🇳
# force redeploy 1783013492

