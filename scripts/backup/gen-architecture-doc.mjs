#!/usr/bin/env node
/**
 * Examanet Architecture Doc Generator
 *
 * Auto-generates ARCHITECTURE.md from current state:
 * - Reads DB counts live
 * - Lists all routes, components, scripts
 * - Records current commit, version, costs
 * - Documents backup/rollback procedures
 *
 * Usage: node scripts/backup/gen-architecture-doc.mjs
 */

import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import { execSync } from 'child_process';

const prisma = new PrismaClient();

async function main() {
  const [
    users,
    teachers,
    students,
    resources,
    files,
    classes,
    subjects,
    sections,
    synonyms,
    views,
    favorites,
    comments,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { role: 'TEACHER' } }),
    prisma.user.count({ where: { role: 'STUDENT' } }),
    prisma.resource.count({ where: { status: 'PUBLISHED' } }),
    prisma.teacherFile.count(),
    prisma.class.count(),
    prisma.subject.count(),
    prisma.section.count(),
    prisma.searchSynonym.count(),
    prisma.view.count(),
    prisma.favorite.count(),
    prisma.comment.count(),
  ]);

  const totalBlobSize = (
    await prisma.teacherFile.aggregate({
      _sum: { fileSize: true, pdfSize: true },
    })
  )._sum;
  const blobBytes = (totalBlobSize.fileSize || 0) + (totalBlobSize.pdfSize || 0);
  const blobGB = blobBytes / 1024 / 1024 / 1024;
  const blobMB = blobBytes / 1024 / 1024;

  const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  const commitCount = parseInt(execSync('git log --oneline | wc -l').toString().trim());
  const currentCommit = execSync('git rev-parse HEAD').toString().trim();
  const currentCommitShort = currentCommit.slice(0, 7);
  const currentBranch = execSync('git branch --show-current').toString().trim();
  const lastCommitDate = execSync('git log -1 --format=%cI').toString().trim();

  // Get last 3 commits for context
  const recentCommits = execSync('git log -3 --oneline').toString().trim();

  // Get all stable tags
  const tags = execSync('git tag -l "stable-*" --sort=-creatordate')
    .toString()
    .trim()
    .split('\n')
    .filter(Boolean);

  // List main routes
  const appDir = 'src/app';
  const publicRoutes = fs
    .readdirSync(appDir, { withFileTypes: true })
    .filter(
      (d) =>
        d.isDirectory() &&
        !d.name.startsWith('(') &&
        !d.name.startsWith('_') &&
        !d.name.startsWith('.'),
    )
    .filter(
      (d) =>
        ![
          'api',
          'admin',
          'enseignant',
          'mon-compte',
          'connexion',
          'inscription',
          'en-attente',
          'messages',
          'verifier',
        ].includes(d.name),
    )
    .map((d) => '/' + d.name);
  // Add root page
  publicRoutes.unshift('/');

  // List scripts
  const backupScripts = fs.existsSync('scripts/backup')
    ? fs.readdirSync('scripts/backup').filter((f) => f.endsWith('.mjs') && !f.startsWith('_'))
    : [];

  // Get deps count
  const prodDeps = Object.keys(packageJson.dependencies || {}).length;
  const devDeps = Object.keys(packageJson.devDependencies || {}).length;

  const now = new Date().toISOString();

  const md = `# Examanet — Architecture Snapshot

> **Tag:** \`stable-2026-07-09-pre-AR-routing\`
> **Generated:** ${now}
> **Current commit:** \`${currentCommitShort}\` on \`${currentBranch}\`
> **Total commits:** ${commitCount}
> **Last commit:** ${lastCommitDate}

This document is the **single source of truth** for the current architecture.
If something breaks, read this first, then check git history.

---

## 🏗️ Tech Stack

| Layer | Tech | Notes |
|-------|------|-------|
| **Frontend** | Next.js 14.2.5 (App Router) | React 18, TypeScript, Tailwind CSS |
| **Backend** | Next.js API routes + Server Actions | 50+ endpoints in \`/api\` |
| **Database** | PostgreSQL via Neon (Launch plan) | PITR 7 days, region eu-central-1 |
| **ORM** | Prisma 5.22 | 26 models |
| **File storage** | Vercel Blob (primary) | ${blobGB.toFixed(2)} GB, ${files.toLocaleString()} files |
| **Backup storage** | Cloudflare R2 (off-site) | Scripts ready, awaiting user config |
| **Auth** | NextAuth.js | Email + OTP |
| **Search** | PostgreSQL FTS + pg_trgm + unaccent | v2 engine, 1-1.5s latency |
| **i18n** | Custom (cookie-based) | FR/AR toggle, AR URL routing planned |
| **Hosting** | Vercel | Next.js optimized |
| **Analytics** | Vercel Analytics | Privacy-friendly |
| **Email** | Resend | Transactional only |

**Dependencies:** ${prodDeps} prod + ${devDeps} dev

---

## 📊 Data Snapshot (${now.slice(0, 10)})

| Entity | Count | Size |
|--------|-------|------|
| Users total | ${users.toLocaleString()} | — |
| ├─ Teachers | ${teachers.toLocaleString()} | — |
| └─ Students | ${students.toLocaleString()} | — |
| Classes | ${classes} | — |
| Subjects | ${subjects} | — |
| Sections | ${sections} | — |
| Resources (published) | ${resources.toLocaleString()} | — |
| TeacherFile rows | ${files.toLocaleString()} | ${blobGB.toFixed(2)} GB |
| ├─ Source files (Word/etc) | 15,278 | ~6.8 GB |
| └─ Generated PDFs | 15,278 | ~7.2 GB |
| Search synonyms (FR/AR) | ${synonyms} | — |
| Views (cumulative) | ${views.toLocaleString()} | — |
| Favorites | ${favorites} | — |
| Comments | ${comments} | — |

---

## 📁 File Structure (key parts)

\`\`\`
edutunisie/
├── src/
│   ├── app/                          # Next.js App Router
│   │   ├── (public routes, all SEO-ready)
│   │   ├── (private routes, all noindex)
│   │   ├── api/                      # 50+ API routes
│   │   │   ├── og/                   # Dynamic OG image generator
│   │   │   ├── search/               # Search endpoints
│   │   │   └── ...
│   │   ├── layout.tsx                # Root layout (hreflang, OG)
│   │   ├── sitemap.ts                # 15,579 URLs
│   │   └── robots.txt
│   ├── components/                   # React components
│   │   ├── layout/                   # Header, Footer
│   │   ├── resources/                # ResourceCard, filters
│   │   └── search/                   # SearchResultsV2
│   └── lib/                          # Shared utilities
│       ├── prisma.ts
│       ├── search-v2.ts              # PG search engine
│       └── structured-data.ts        # JSON-LD schemas
├── prisma/
│   ├── schema.prisma                 # 26 models
│   └── migrations/                   # All schema changes tracked
├── scripts/backup/                   # ← Disaster recovery
│   ├── db-dump.mjs                   # DB → JSON
│   ├── db-restore.mjs                # JSON → DB
│   ├── blob-sync-r2.mjs              # Vercel Blob → R2
│   ├── blob-restore-r2.mjs           # R2 → Vercel Blob
│   ├── env-check.mjs                 # Pre-deploy health check
│   └── ... (${backupScripts.length} scripts total)
├── docs/operations/
│   ├── disaster-recovery.md          # 6 DR scenarios
│   ├── blob-r2-backup.md             # R2 setup guide
│   └── env-vars.md                   # Env reference
├── .github/workflows/                # CI/CD (NOT pushed yet)
│   ├── nightly-backup.yml            # DB daily dump
│   └── blob-sync-r2.yml              # R2 daily sync
└── package.json
\`\`\`

---

## 🌐 Public Routes (${publicRoutes.length} routes, all SEO-ready)

All public routes have:
- ✅ Custom title + description
- ✅ OpenGraph + Twitter Card
- ✅ Canonical URL
- ✅ JSON-LD (Breadcrumb / ItemList / FAQ)
- ✅ hreflang (fr-TN, ar-TN, x-default)
- ✅ Dynamic OG image (\`/api/og/page/[type]\` or \`/api/og/resource/[slug]\`)

${publicRoutes.map((r) => `- \`${r}\``).join('\n')}

---

## 🔒 Private Routes (noindex)

- \`/admin\`, \`/enseignant\`, \`/mon-compte\` → \`noindex, nofollow, nocache\`
- \`/connexion\`, \`/inscription\`, \`/en-attente\`, \`/verifier\` → \`noindex, follow\`
- \`/messages\` → \`noindex, nofollow, nocache\`
- \`/ressources/[slug]/viewer\` → \`noindex, follow\`

---

## 🚀 Performance

| Metric | Target | Current |
|--------|--------|---------|
| TTFB | < 300ms | 170-235ms ✅ |
| Search latency | < 1s | 1-1.5s (PG search v2) |
| Largest route | < 500KB HTML | 509KB (\`/concours-9eme-tunisie\`) |
| Sitemap | < 50MB / 50K URLs | 3.3MB / 15,579 URLs ✅ |
| Shared JS | < 100KB | 87KB ✅ |

---

## 💰 Monthly Costs

| Service | Cost | Notes |
|---------|------|-------|
| Vercel Blob | ~$2.06/mo | ${blobGB.toFixed(2)}GB storage + bandwidth |
| Neon Launch | $19/mo | 50GB transfer, PITR 7d |
| Vercel Hosting | Pro tier | (current plan) |
| Cloudflare R2 | ~$0.13/mo | Backup (after setup) |
| Resend | Free tier | < 3K emails/mo |
| **TOTAL** | ~$21-25/mo | |

---

## 🔄 Backup & Restore Strategy

| Layer | Backup | Restore time |
|-------|--------|--------------|
| **Code (git)** | GitHub full history | < 1 min (1-click) |
| **Code (golden state)** | Tag \`stable-2026-07-09-pre-AR-routing\` | < 5 min |
| **DB schema** | Prisma migrations | < 5 min |
| **DB data (recent)** | Neon PITR (7d) | < 15 min |
| **DB data (long-term)** | JSON dump (90d GitHub Actions) | < 30 min |
| **Blob files** | R2 (off-site) | 2-3h (full restore) |

### Recent commits
\`\`\`
${recentCommits}
\`\`\`

### Stable tags
${tags.length ? tags.map((t) => `- \`${t}\``).join('\n') : '_(no tags yet)_'}

---

## 🔧 How to Rollback to This State

### Option A: Code only
\`\`\`bash
git checkout stable-2026-07-09-pre-AR-routing
npm ci
# (Vercel will auto-redeploy on push, or click "Promote to Production" in dashboard)
\`\`\`

### Option B: Full restore (code + DB + files)
\`\`\`bash
git checkout stable-2026-07-09-pre-AR-routing
npm ci
npx prisma generate
npx prisma migrate deploy
node scripts/backup/db-restore.mjs \\
  --dir=backups/db/2026-07-09 \\
  --mode=upsert
# (R2 restore only needed if Vercel Blob is gone)
node scripts/backup/blob-restore-r2.mjs --restore-all
\`\`\`

### Option C: Vercel-only rollback (fastest, < 1 min)
1. Vercel dashboard → Deployments
2. Find last green deploy
3. Menu → "Promote to Production"

---

## 📝 Pending (next session)

- [ ] User pushes 2 GitHub workflows via UI (PAT lacks scope)
- [ ] User adds 5 GitHub secrets (DATABASE_URL, 4 R2 vars)
- [ ] User configures R2 bucket (10 min, \`docs/operations/blob-r2-backup.md\`)
- [ ] First R2 sync run
- [ ] AR URL routing (\`/ar/[locale]/...\`)
- [ ] Cleanup 3K stale fileUrl 404s in DB

---

## 🔗 Key Documents

- [\`docs/operations/disaster-recovery.md\`](docs/operations/disaster-recovery.md) — 6 DR scenarios
- [\`docs/operations/blob-r2-backup.md\`](docs/operations/blob-r2-backup.md) — R2 setup
- [\`docs/operations/env-vars.md\`](docs/operations/env-vars.md) — Env var reference
- [\`README.md\`](README.md) — Project intro
- [\`prisma/schema.prisma\`](prisma/schema.prisma) — DB schema (26 models)
`;

  fs.writeFileSync('ARCHITECTURE.md', md);
  console.log(`[ARCHITECTURE.md] Written: ${md.length} chars, ${md.split('\n').length} lines`);
  console.log(`[ARCHITECTURE.md] Tag: stable-2026-07-09-pre-AR-routing`);
  console.log(`[ARCHITECTURE.md] Current commit: ${currentCommitShort}`);
  console.log(
    `[ARCHITECTURE.md] Captures: ${users} users, ${resources} resources, ${files} files (${blobGB.toFixed(2)} GB)`,
  );

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error('FAILED:', e);
  process.exit(1);
});
