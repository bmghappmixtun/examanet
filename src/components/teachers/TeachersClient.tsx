'use client';
// @ts-nocheck
// 2026-08-28: Client component for /fr/professeurs.
// Fetches data from /api/professeurs/data and renders the full UI.
// All numeric fields are guarded with `?? 0` to prevent `toLocaleString` crashes.

import { useEffect, useState, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Link } from '@/i18n/navigation';
import {
  GraduationCap, MapPin, Star, Search, ChevronLeft, ChevronRight,
  Award, Sparkles, Users, CheckCircle2, X, BookOpen,
} from 'lucide-react';
import TeachersSearchBar from '@/app/[locale]/professeurs/TeachersSearchBar';
import TeachersFilters from '@/app/[locale]/professeurs/TeachersFilters';
import TeachersSort from '@/app/[locale]/professeurs/TeachersSort';

interface PageData {
  totalActive: number;
  totalVerified: number;
  totalResources: number;
  totalMatching: number;
  totalPages: number;
  page: number;
  pageSize: number;
  sort: string;
  q: string;
  teachers: any[];
  subjectsTaught: { slug: string; nameFr: string; nameAr: string | null; color: string | null }[];
  classesTaught: { slug: string; nameFr: string; nameAr: string | null }[];
}

export default function TeachersClient() {
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
        const res = await fetch(`/api/professeurs/data?${searchParams.toString()}`);
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
  }, [searchParams]);

  if (loading) return <TeachersLoading />;
  if (error) return <TeachersError />;
  if (!data) return <TeachersLoading />;

  return <TeachersView data={data} />;
}

function TeachersLoading() {
  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <main className="flex-1 pt-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="h-32 bg-slate-200 rounded-2xl animate-pulse mb-6" />
          <div className="grid lg:grid-cols-[280px_1fr] gap-8">
            <div className="h-96 bg-slate-100 rounded-2xl animate-pulse" />
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="h-48 bg-slate-100 rounded-2xl animate-pulse" />
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function TeachersError() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-slate-50">
      <div className="text-center max-w-md">
        <Users className="w-12 h-12 text-slate-300 mx-auto mb-3" />
        <h1 className="text-xl font-bold text-slate-700 mb-2">Professeurs temporairement indisponibles</h1>
        <p className="text-slate-500">Cette page sera de retour sous peu.</p>
        <Link href="/" className="text-primary-600 hover:underline mt-4 inline-block">← Retour à l'accueil</Link>
      </div>
    </div>
  );
}

function TeachersView({ data }: { data: PageData }) {
  const sp = Object.fromEntries(
    typeof window !== 'undefined' ? Array.from(new URLSearchParams(window.location.search).entries()) : []
  );
  const q = data.q || (sp.q || '');
  const subjectSlugs = (sp.subject || '').split(',').filter(Boolean);
  const classSlugs = (sp.class || '').split(',').filter(Boolean);
  const verifiedOnly = sp.verified === '1';
  const sort = data.sort || 'popular';
  const page = data.page;
  const totalPages = data.totalPages;
  const hasFilters = !!(q || subjectSlugs.length || classSlugs.length || verifiedOnly);

  const teachers = data.teachers || [];
  const subjectsTaught = data.subjectsTaught || [];
  const classesTaught = data.classesTaught || [];

  // Find featured teachers (top 3 by current sort, first page, no filters)
  const featured = page === 1 && !hasFilters && sort === 'popular' ? teachers.slice(0, 3) : [];

  return (
    <div className="min-h-screen flex flex-col">
      <main className="flex-1 pt-20">
        {/* HERO */}
        <section className="bg-gradient-to-br from-amber-50 via-orange-50 to-rose-50 py-12 lg:py-16 border-b border-amber-100">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center gap-2 text-amber-700 text-sm font-bold mb-3">
              <GraduationCap className="w-4 h-4" />
              <span>Enseignants certifiés</span>
            </div>
            <h1 className="text-4xl lg:text-5xl font-extrabold mb-3 tracking-tight">
              <span className="gradient-text">{data.totalActive.toLocaleString('fr-FR')}</span> enseignants certifiés
            </h1>
            <p className="text-lg text-slate-600 max-w-2xl mb-6">
              Découvrez les meilleurs professeurs tunisiens et leurs ressources pédagogiques gratuites.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-3xl">
              <Stat icon={Users} value={data.totalActive} label="Professeurs" />
              <Stat icon={CheckCircle2} value={data.totalVerified} label="Vérifiés" />
              <Stat icon={BookOpen} value={data.totalResources} label="Ressources" />
              <Stat icon={Award} value={subjectsTaught.length} label="Matières" />
            </div>
          </div>
        </section>

        {/* SEARCH + SORT BAR */}
        <section className="bg-white border-b border-slate-200 sticky top-16 z-30">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <TeachersSearchBar initialQ={q} />
            <div className="flex items-center justify-between gap-3 mt-3 flex-wrap">
              <p className="text-sm text-slate-600">
                <span className="font-bold text-slate-900">{(data.totalMatching ?? 0).toLocaleString('fr-FR')}</span> professeur
                {data.totalMatching !== 1 ? 's' : ''}
                {hasFilters ? <span className="text-slate-500"> · filtré</span> : null}
              </p>
              <TeachersSort current={sort} />
            </div>
          </div>
        </section>

        {/* MAIN GRID */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="grid lg:grid-cols-[280px_1fr] gap-8">
            <aside className="lg:sticky lg:top-32 lg:self-start">
              <TeachersFilters
                subjects={subjectsTaught}
                classes={classesTaught}
                selectedSubjects={subjectSlugs}
                selectedClasses={classSlugs}
                verifiedOnly={verifiedOnly}
              />
            </aside>
            <div>
              {teachers.length === 0 ? (
                <EmptyState q={q} />
              ) : (
                <>
                  {featured.length > 0 && (
                    <div className="mb-6">
                      <div className="flex items-center gap-2 text-amber-700 text-sm font-bold mb-3">
                        <Sparkles className="w-4 h-4" />
                        <span>Top contributeurs</span>
                      </div>
                      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
                        {featured.map((t: any) => (
                          <TeacherCard key={t.id} t={t} stats={t.stats} featured />
                        ))}
                      </div>
                    </div>
                  )}

                  {hasFilters && (
                    <ActiveChips
                      subjectSlugs={subjectSlugs}
                      classSlugs={classSlugs}
                      q={q}
                      verifiedOnly={verifiedOnly}
                      subjects={subjectsTaught}
                      classes={classesTaught}
                    />
                  )}

                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
                    {teachers.map((t: any) => (
                      <TeacherCard key={t.id} t={t} stats={t.stats} />
                    ))}
                  </div>

                  {totalPages > 1 && (
                    <Pagination current={page} total={totalPages} />
                  )}
                </>
              )}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

function Stat({ icon: Icon, value, label }: any) {
  return (
    <div className="bg-white/70 backdrop-blur rounded-xl px-4 py-3 border border-amber-100">
      <div className="flex items-center gap-2 text-amber-600 mb-1">
        <Icon className="w-4 h-4" />
        <span className="text-xs font-medium text-slate-600">{label}</span>
      </div>
      <div className="text-2xl font-extrabold text-slate-900">
        {(value ?? 0).toLocaleString('fr-FR')}
      </div>
    </div>
  );
}

function EmptyState({ q }: { q: string }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
      <Search className="w-12 h-12 text-slate-300 mx-auto mb-3" />
      <h3 className="text-xl font-bold mb-2">Aucun professeur trouvé</h3>
      <p className="text-slate-500">
        {q ? `Aucun résultat pour "${q}".` : 'Aucun professeur ne correspond à ces filtres.'}
      </p>
    </div>
  );
}

function ActiveChips({ subjectSlugs, classSlugs, q, verifiedOnly, subjects, classes }: any) {
  const chips: { key: string; label: string; param: string; value: string }[] = [];
  for (const slug of subjectSlugs) {
    const s = subjects.find((x: any) => x.slug === slug);
    const remaining = subjectSlugs.filter((x: string) => x !== slug);
    chips.push({
      key: `s-${slug}`,
      label: s?.nameFr || slug,
      param: 'subject',
      value: remaining.join(','),
    });
  }
  for (const slug of classSlugs) {
    const c = classes.find((x: any) => x.slug === slug);
    const remaining = classSlugs.filter((x: string) => x !== slug);
    chips.push({
      key: `c-${slug}`,
      label: c?.nameFr || slug,
      param: 'class',
      value: remaining.join(','),
    });
  }
  if (q) chips.push({ key: 'q', label: `"${q}"`, param: 'q', value: '' });
  if (verifiedOnly) chips.push({ key: 'v', label: 'Vérifiés', param: 'verified', value: '' });
  if (chips.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 mb-4">
      {chips.map((c) => (
        <Link
          key={c.key}
          href={`/fr/professeurs?${new URLSearchParams(window.location.search).toString().replace(new RegExp(`&?${c.param}=[^&]*`), '')}`}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-100 text-amber-800 text-sm font-medium rounded-full hover:bg-amber-200 transition"
        >
          {c.label}
          <X className="w-3 h-3" />
        </Link>
      ))}
    </div>
  );
}

function TeacherCard({ t, stats, featured }: any) {
  const fullName = [t.firstName, t.lastName].filter(Boolean).join(' ') || t.firstNameAr || 'Professeur';
  const initials = fullName.split(' ').map((p: string) => p[0]).slice(0, 2).join('').toUpperCase();
  const href = `/fr/professeurs/${t.numericId}/${t.slug}`;
  const s = stats || { files: 0, downloads: 0, views: 0, rating: 0, followers: 0 };
  return (
    <Link
      href={href as any}
      className={`group block relative bg-white rounded-2xl border ${featured ? 'border-amber-300 ring-2 ring-amber-100' : 'border-slate-200'} p-5 hover:-translate-y-0.5 hover:shadow-lg transition-all`}
    >
      {featured && (
        <div className="absolute -top-2 -end-2 bg-gradient-to-br from-amber-400 to-orange-500 text-white text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full shadow-md">
          Top
        </div>
      )}
      <div className="flex items-start gap-3 mb-3">
        {t.avatarUrl ? (
          <img src={t.avatarUrl} alt={fullName} className="w-14 h-14 rounded-full object-cover" />
        ) : (
          <div className="w-14 h-14 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-white font-bold text-lg">
            {initials}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <h3 className="font-bold text-slate-900 truncate group-hover:text-amber-600 transition-colors">{fullName}</h3>
            {t.isVerifiedTeacher && <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />}
          </div>
          {t.firstNameAr && (
            <p className="text-xs text-slate-500 truncate" dir="rtl" lang="ar">{t.firstNameAr} {t.lastNameAr}</p>
          )}
        </div>
      </div>
      {t.bio && <p className="text-sm text-slate-600 line-clamp-2 mb-3">{t.bio}</p>}
      <div className="flex flex-wrap items-center gap-2 mb-3 text-xs text-slate-500">
        {t.schoolName && (
          <span className="inline-flex items-center gap-1 bg-slate-50 px-2 py-0.5 rounded">
            <GraduationCap className="w-3 h-3" />
            {t.schoolName}
          </span>
        )}
        {t.governorate && (
          <span className="inline-flex items-center gap-1 bg-slate-50 px-2 py-0.5 rounded">
            <MapPin className="w-3 h-3" />
            {t.governorate}
          </span>
        )}
      </div>
      <div className="flex items-center justify-between pt-3 border-t border-slate-100 text-xs">
        <div className="flex items-center gap-3 text-slate-500">
          <span title="Fichiers" className="flex items-center gap-1">
            <BookOpen className="w-3 h-3" />
            <span className="font-bold text-slate-900">{(s.files ?? 0).toLocaleString('fr-FR')}</span>
          </span>
          <span title="Vues" className="flex items-center gap-1">
            <span>👁</span>
            <span className="font-bold text-slate-900">{(s.views ?? 0).toLocaleString('fr-FR')}</span>
          </span>
          <span title="Note" className="flex items-center gap-1">
            <Star className="w-3 h-3 text-amber-500" />
            <span className="font-bold text-slate-900">{(s.rating ?? 0).toFixed(1)}</span>
          </span>
          <span title="Abonnés" className="flex items-center gap-1">
            <Users className="w-3 h-3" />
            <span className="font-bold text-slate-900">{(s.followers ?? 0).toLocaleString('fr-FR')}</span>
          </span>
        </div>
      </div>
    </Link>
  );
}

function Pagination({ current, total }: { current: number; total: number }) {
  if (total <= 1) return null;
  const buildHref = (page: number) => {
    const params = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
    if (page === 1) params.delete('page');
    else params.set('page', String(page));
    const qs = params.toString();
    return `/fr/professeurs${qs ? '?' + qs : ''}`;
  };
  
  const pages: (number | 'ellipsis')[] = [];
  const add = (n: number) => pages.push(n);
  add(1);
  if (current > 4) pages.push('ellipsis');
  for (let p = Math.max(2, current - 1); p <= Math.min(total - 1, current + 1); p++) add(p);
  if (current < total - 3) pages.push('ellipsis');
  if (total > 1) add(total);
  
  return (
    <nav className="mt-8 flex items-center justify-center gap-1" aria-label="Pagination">
      {current > 1 && (
        <Link href={buildHref(current - 1) as any} className="w-10 h-10 flex items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100">
          <ChevronLeft className="w-4 h-4" />
        </Link>
      )}
      {pages.map((p, i) =>
        p === 'ellipsis' ? (
          <span key={`e${i}`} className="w-10 h-10 flex items-center justify-center text-slate-400">…</span>
        ) : p === current ? (
          <span key={p} className="w-10 h-10 flex items-center justify-center rounded-lg bg-amber-500 text-white font-bold">{p}</span>
        ) : (
          <Link key={p} href={buildHref(p) as any} className="w-10 h-10 flex items-center justify-center rounded-lg text-slate-700 hover:bg-slate-100">{p}</Link>
        )
      )}
      {current < total && (
        <Link href={buildHref(current + 1) as any} className="w-10 h-10 flex items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100">
          <ChevronRight className="w-4 h-4" />
        </Link>
      )}
    </nav>
  );
}
