// @ts-nocheck
/**
 * /admin/features — Dev-facing feature log
 *
 * 2026-10-07: Created to track mega-menu deployment + future prod
 * deploys. Each entry includes commit SHA, deploy version, scope,
 * and lessons learned (for future reference).
 *
 * Sources for verifications:
 * - Local git log
 * - CF Workers versions API
 * - Public site curl tests
 */

import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { Rocket, GitBranch, Server, BookOpen, Layers, Filter, Smartphone, Bug } from 'lucide-react';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Features log',
  description: 'Suivi des déploiements et features Examanet (admin/dev).',
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: { index: false, follow: false },
  },
};

interface FeatureEntry {
  date: string;
  title: string;
  scope: string;
  commits: string[];
  deploy: string;
  highlights: string[];
  lessons?: string[];
  icon: any;
  color: string;
}

const FEATURES: FeatureEntry[] = [
  {
    date: '2026-10-07',
    title: 'Mega menu Catalogue + APEX preview pages (déploiement prod)',
    scope: 'Header navigation + 3 nouvelles pages preview (devoirs/cours/séries)',
    commits: [
      '129044e3 fix(mega-menu): portal modal to document.body (centered on viewport)',
      '29e93b56 feat(header): add Catalogue mega menu as 1st nav item (gray hamburger)',
      '9784ee52 feat(mega-menu-G): brand colors + 5 cols lycée + 3 cols AR + SVT/STI labels',
      '65ca464a feat(mega-menu-G): remove hero cards + Sciences Techniques override + colored cycle tabs',
      '96b24d3f feat(mega-menu-G): grayscale palette + remove decorative icons + larger links',
      '3b3d34fb fix(sidebar-cycle): hardcode colors instead of var(--accent) (CSS scoping issue)',
      'bcac4242 feat(cycle-filtering): filter devoir/cours/séries by cycle + Technologie industrielle override',
      'f9cce9fa feat(mega-menu): add Proposition G — Collège/Lycée cycle tabs',
      'a3e3c4dc feat(mega-menu): link SubjectColumn to new APEX preview-* routes',
    ],
    deploy: 'examanet-prod @ 20255433-3729-4273-a522-3bde5d3a894a (rebased on origin/main)',
    highlights: [
      'Header: ☰ Catalogue en 1ère position (gray hamburger)',
      'Mega menu G : 2 tabs cycle (Collège orange #f29046 + Lycée bleu #428396)',
      'Collège : 13 matières, FR 1/3 + AR 2/3 (3 colonnes)',
      'Lycée : 24 matières, 5 colonnes, footer Examens Bac Tunisie',
      'Pages preview-devoirs2 / preview-cours2 / preview-series2 accessibles via URL ?cycle=college|lycee',
      'Override lycée : Sciences Techniques (Technologie), SVT (SVT), STI (Système Exploitation/Réseaux)',
      'Mobile drawer : Catalogue en 1er, CustomEvent → modal',
      'Arabe : فروض / تمارين / دروس (vocabulaire scolaire tunisien)',
    ],
    lessons: [
      'Lesson #94 (function props RSC→Client) — Solution : CustomEvent + Client bridge',
      'Lesson #96 (CSS vars scoped) — Solution : hardcoded colors (sidebar cycle buttons, mega menu icons)',
      'Lesson #98 (D1 Class.id est CUID string, pas integer) — `r.id` direct, jamais `Number(r.id)`',
      'Lesson #99 (unfinished precedent removal) — Removing import = remove ALL usage references',
      'Lesson #96b (fixed position inside transformed/backdrop-filter ancestor) — Solution : createPortal → document.body pour échapper au containing block du header backdrop-blur-xl',
      'Lesson #100 (Technologie display name) — Programme officiel = « Technologie», user override lycée = « Sciences Techniques » (matche le nom de la SECTION)',
    ],
    icon: Rocket,
    color: 'bg-emerald-500',
  },
];

export default async function AdminFeaturesPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/connexion');
  if (user.role !== 'ADMIN') redirect('/');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white shadow-md">
            <Rocket className="w-6 h-6" />
          </div>
          <div className="flex-1">
            <h1 className="text-2xl font-extrabold text-slate-900">Features log</h1>
            <p className="text-sm text-slate-600 mt-1">
              Suivi des déploiements prod et features livrées. Mis à jour manuellement à chaque release.
            </p>
            <p className="text-xs text-slate-500 mt-2">
              <span className="font-mono">{FEATURES.length}</span> entrée{FEATURES.length > 1 ? 's' : ''} •{' '}
              <a href="https://github.com/bmghappmixtun/examanet/commits/main" className="text-primary-600 hover:underline" target="_blank" rel="noopener">
                Historique complet sur GitHub →
              </a>
            </p>
          </div>
        </div>
      </div>

      {/* Timeline */}
      <div className="space-y-4">
        {FEATURES.map((entry, idx) => {
          const Icon = entry.icon;
          return (
            <article key={idx} className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
              {/* Title row */}
              <header className="flex items-start gap-4 pb-4 border-b border-slate-100">
                <div className={`w-10 h-10 rounded-xl ${entry.color} text-white flex items-center justify-center flex-shrink-0`}>
                  <Icon className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <time className="text-xs font-mono text-slate-500 uppercase tracking-wide">
                    {entry.date}
                  </time>
                  <h2 className="text-lg font-bold text-slate-900 mt-1">{entry.title}</h2>
                  <p className="text-sm text-slate-600 mt-1">{entry.scope}</p>
                </div>
              </header>

              {/* Deploy line */}
              <div className="py-3 border-b border-slate-100 flex items-start gap-2 text-xs">
                <Server className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5" />
                <code className="text-slate-700 break-all">{entry.deploy}</code>
              </div>

              {/* Highlights */}
              <section className="py-3 border-b border-slate-100">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-1">
                  <Layers className="w-3.5 h-3.5" />
                  Highlights
                </h3>
                <ul className="space-y-1.5 text-sm text-slate-700">
                  {entry.highlights.map((h, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="text-emerald-500 font-bold">▸</span>
                      <span>{h}</span>
                    </li>
                  ))}
                </ul>
              </section>

              {/* Commits */}
              <section className="py-3 border-b border-slate-100">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-1">
                  <GitBranch className="w-3.5 h-3.5" />
                  Commits ({entry.commits.length})
                </h3>
                <ol className="space-y-1 font-mono text-xs text-slate-600">
                  {entry.commits.map((c, i) => (
                    <li key={i} className="truncate">
                      <span className="text-slate-400">{c.split(' ')[0]}</span>{' '}
                      <span className="text-slate-700">{c.split(' ').slice(1).join(' ')}</span>
                    </li>
                  ))}
                </ol>
              </section>

              {/* Lessons */}
              {entry.lessons && entry.lessons.length > 0 && (
                <section className="py-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-1">
                    <BookOpen className="w-3.5 h-3.5" />
                    Leçons apprises ({entry.lessons.length})
                  </h3>
                  <ul className="space-y-1.5 text-xs text-slate-600">
                    {entry.lessons.map((l, i) => (
                      <li key={i} className="flex gap-2">
                        <Bug className="w-3 h-3 text-amber-500 flex-shrink-0 mt-0.5" />
                        <span>{l}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </article>
          );
        })}
      </div>

      {/* Future entries teaser */}
      <div className="bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl p-6 text-center">
        <Filter className="w-8 h-8 mx-auto text-slate-400 mb-2" />
        <p className="text-sm text-slate-500">
          Les prochaines features seront ajoutées en haut de la timeline (ordre chronologique inverse).
        </p>
      </div>
    </div>
  );
}