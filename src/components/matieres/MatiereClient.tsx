'use client';
// @ts-nocheck
// 2026-08-28: Subject page (matieres/[subject]) — TRUE client-only shim.
// Fetches data from /api/matieres/[slug]/data and renders the same UI as
// the original server component. Avoids the getCloudflareContext() race
// condition on CF Workers.

import { useEffect, useState, use } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useLocale } from 'next-intl';
import { Link } from '@/i18n/navigation';
import ResourceCard from '@/components/resources/ResourceCard';
import SubjectHero from '@/components/subjects/SubjectHero';
import SubjectFilters from '@/components/subjects/SubjectFilters';
import SmartPagination from '@/components/ui/SmartPagination';
import { Sparkles, ArrowRight, BookOpen, GraduationCap } from 'lucide-react';
import { getSubjectConfig, SUBJECTS_CONFIG } from '@/lib/subjects.config';
import { getLocalizedName } from '@/lib/localized-name';

interface PageData {
  subject: {
    id: string; numericId: number | null; slug: string; nameFr: string; nameAr: string | null;
    color: string | null; icon: string | null; order: number;
  };
  resources: any[];
  totalCount: number;
  page: number;
  pageSize: number;
  facets: {
    byType: { value: string; count: number }[];
    byTrimestre: { value: string; count: number }[];
    byClass: { slug: string; nameFr: string; nameAr: string; count: number }[];
    bySection: { slug: string; nameFr: string; nameAr: string; count: number }[];
    byProf: any[];
  };
  classes: any[];
  sections: any[];
  teachers: any[];
  relatedSubjects: any[];
}

interface MatiereClientProps {
  slug: string;
}

export default function MatiereClient({ slug }: MatiereClientProps) {
  const locale = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [data, setData] = useState<PageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function fetchData() {
      try {
        setLoading(true);
        const params = new URLSearchParams();
        // Pass through filter params
        for (const key of ['page', 'sort', 'type', 'annee', 'section', 'trimestre', 'prof']) {
          const val = searchParams.get(key);
          if (val) params.set(key, val);
        }
        const qs = params.toString();
        const url = `/api/matieres/${slug}/data${qs ? '?' + qs : ''}`;
        const res = await fetch(url);
        if (cancelled) return;
        if (!res.ok) {
          setError(res.status === 404 ? 'not_found' : 'server_error');
          setLoading(false);
          return;
        }
        const json = await res.json();
        if (cancelled) return;
        if (json.error) {
          setError(json.error);
        } else {
          setData(json);
        }
        setLoading(false);
      } catch (e: any) {
        if (!cancelled) {
          setError('network');
          setLoading(false);
        }
      }
    }
    fetchData();
    return () => { cancelled = true; };
  }, [slug, searchParams]);

  if (loading) {
    return <MatiereLoading />;
  }

  if (error === 'not_found') {
    return <MatiereNotFound />;
  }

  if (error || !data) {
    return <MatiereError />;
  }

  return <MatiereView data={data} locale={locale} />;
}

function MatiereLoading() {
  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <main className="flex-1 pt-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-sky-200 to-sky-100 animate-pulse" />
              <div>
                <div className="h-7 w-48 bg-slate-200 rounded animate-pulse mb-2" />
                <div className="h-4 w-72 bg-slate-200 rounded animate-pulse" />
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 mb-6">
            {[1,2,3,4,5].map(i => <div key={i} className="h-9 w-24 bg-slate-100 rounded-full animate-pulse" />)}
          </div>
          <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-5">
            {[1,2,3,4,5,6].map(i => <div key={i} className="h-64 bg-slate-100 rounded-2xl animate-pulse" />)}
          </div>
        </div>
      </main>
    </div>
  );
}

function MatiereNotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="text-center max-w-md">
        <BookOpen className="w-16 h-16 text-slate-300 mx-auto mb-4" />
        <h1 className="text-2xl font-bold text-slate-900 mb-2">Matière non trouvée</h1>
        <p className="text-slate-600 mb-6">La matière demandée n'existe pas ou n'est pas encore disponible.</p>
        <Link href="/matieres" className="text-primary-600 hover:underline">← Voir toutes les matières</Link>
      </div>
    </div>
  );
}

function MatiereError() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="text-center max-w-md">
        <h1 className="text-2xl font-bold text-slate-900 mb-2">Matière temporairement indisponible</h1>
        <p className="text-slate-600 mb-6">Cette page sera de retour sous peu.</p>
        <Link href="/matieres" className="text-primary-600 hover:underline">← Retour aux matières</Link>
      </div>
    </div>
  );
}

function MatiereView({ data, locale }: { data: PageData; locale: string }) {
  const { subject, resources, totalCount, page, pageSize, facets, classes, sections, teachers, relatedSubjects } = data;
  const cfg = getSubjectConfig(subject.slug);
  const color = cfg?.color ?? subject.color ?? '#0EA5E9';

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  
  // Build unique teachers from byProf (since teachers facet already has unique teachers)
  const uniqueTeachers = (facets.byProf || []).slice(0, 30);

  // Build related subjects with config (emoji, gradient)
  const relatedFinal = relatedSubjects.map((s: any) => {
    const c = SUBJECTS_CONFIG[s.slug];
    return {
      ...s,
      gradient: c?.design?.gradient ?? 'from-slate-100 to-slate-50',
      emoji: c?.design?.emoji ?? '📘',
    };
  });

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <main className="flex-1 pt-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Subject Hero */}
          <SubjectHero subject={subject} color={color} locale={locale} />

          {/* Filters */}
          <SubjectFilters
            classes={classes}
            sections={sections}
            teachers={teachers}
            facets={facets}
            activeFilters={Object.fromEntries(
              typeof window !== 'undefined'
                ? new URLSearchParams(window.location.search)
                : []
            )}
            subjectSlug={subject.slug}
          />

          {/* Resources grid */}
          <div className="mt-6">
            {resources.length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-200 p-16 text-center">
                <div className="text-5xl mb-3">📚</div>
                <h3 className="text-xl font-bold mb-2">Aucune ressource pour ces filtres</h3>
                <p className="text-slate-500">Essayez d'élargir vos critères ou revenez bientôt !</p>
              </div>
            ) : (
              <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-5">
                {resources.map((r: any) => (
                  <ResourceCard key={r.id} resource={r as any} />
                ))}
              </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="mt-8">
                <SmartPagination
                  current={page}
                  total={totalPages}
                  basePath={`/matieres/${subject.slug}`}
                  activeFilters={Object.fromEntries(
                    typeof window !== 'undefined'
                      ? new URLSearchParams(window.location.search)
                      : []
                  )}
                />
              </div>
            )}
          </div>

          {/* Related subjects */}
          {relatedFinal.length > 0 && (
            <section className="mt-16 border-t border-slate-200 pt-12">
              <div className="flex items-center gap-2 mb-6">
                <Sparkles className="w-5 h-5 text-amber-500" />
                <h2 className="text-2xl font-bold text-slate-900">Matières complémentaires</h2>
              </div>
              <p className="text-slate-600 mb-6 -mt-3">
                Ces matières sont liées à <strong>{getLocalizedName(subject, locale)}</strong> dans le système éducatif
                tunisien. Explorez-les pour une vision complète de votre parcours scolaire.
              </p>
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {relatedFinal.map((r: any) => (
                  <Link
                    key={r.slug}
                    href={`/matieres/${r.slug}` as any}
                    className={`group relative overflow-hidden rounded-2xl bg-gradient-to-br ${r.gradient} border border-slate-200 p-5 hover:shadow-md transition`}
                  >
                    <div className="text-4xl mb-2 group-hover:scale-110 transition-transform">
                      {r.emoji}
                    </div>
                    <h3 className="font-bold text-slate-900 mb-1">{getLocalizedName(r, locale)}</h3>
                    <p className="text-xs text-slate-600 mb-3">Découvrir →</p>
                    <ArrowRight className="w-4 h-4 text-slate-400 group-hover:translate-x-1 transition-transform" />
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* FAQ SEO */}
          {cfg?.seo?.faq && cfg.seo.faq.length > 0 && (
            <section className="mt-16 border-t border-slate-200 pt-12">
              <h2 className="text-2xl font-bold text-slate-900 mb-6 flex items-center gap-2">
                <span>❓</span> Questions fréquentes — {getLocalizedName(subject, locale)}
              </h2>
              <div className="space-y-4">
                {cfg.seo.faq.map((f: any, i: number) => (
                  <details
                    key={i}
                    className="bg-white border border-slate-200 rounded-xl p-5 group open:shadow-md transition"
                  >
                    <summary className="cursor-pointer font-semibold text-slate-900 flex items-center justify-between">
                      <span>{f.q}</span>
                      <span className="text-slate-400 group-open:rotate-45 transition-transform text-2xl leading-none">+</span>
                    </summary>
                    <p className="text-slate-600 mt-3 leading-relaxed">{f.a}</p>
                  </details>
                ))}
              </div>
            </section>
          )}
        </div>
      </main>
    </div>
  );
}
