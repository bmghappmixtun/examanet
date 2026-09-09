'use client';
// @ts-nocheck
/**
 * Client component for the /fr/matieres list page.
 * Fetches subjects + counts from /api/matieres/list and renders the grid.
 * Avoids the SSR crash on CF Workers.
 */
import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { BookOpen, Sparkles, ArrowRight, GraduationCap, Loader2 } from 'lucide-react';
import { getSubjectConfig } from '@/lib/subjects.config';
import { SUBJECT_ICONS } from '@/lib/subjects.icons';
import { getLocalizedName } from '@/lib/localized-name';

interface Subject {
  id: string;
  slug: string;
  nameFr: string;
  nameAr: string | null;
  color: string | null;
  order?: number;
  resourceCount: number;
}

interface MatieresListClientProps {
  initialSubjects?: Subject[];
  initialTotal?: number;
  initialTotalResources?: number;
}

export default function MatieresListClient({
  initialSubjects,
  initialTotal,
  initialTotalResources,
}: MatieresListClientProps) {
  const locale = useLocale();
  const t = useTranslations();
  const [subjects, setSubjects] = useState<Subject[]>(initialSubjects || []);
  const [total, setTotal] = useState<number>(initialTotal || 0);
  const [totalResources, setTotalResources] = useState<number>(initialTotalResources || 0);
  const [loading, setLoading] = useState(!initialSubjects || initialSubjects.length === 0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Skip fetch if we already have initial data (SSR shell)
    if (initialSubjects && initialSubjects.length > 0) return;

    let cancelled = false;
    (async () => {
      try {
        const resp = await fetch('/api/matieres/list', { cache: 'no-store' });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = await resp.json();
        if (cancelled) return;
        setSubjects(data.subjects || []);
        setTotal(data.total || 0);
        setTotalResources(data.totalResources || 0);
        setLoading(false);
      } catch (err: any) {
        if (cancelled) return;
        setError(err.message || 'Erreur de chargement');
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [initialSubjects]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 text-center">
          <Loader2 className="w-8 h-8 text-primary-600 animate-spin mx-auto mb-4" />
          <p className="text-slate-500">{t('common.loading', { defaultValue: 'Chargement...' })}</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 text-center">
          <p className="text-red-500 mb-2">{t('common.error', { defaultValue: 'Une erreur est survenue' })}</p>
          <p className="text-slate-400 text-sm">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-50">
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-primary-50 via-white to-sky-50 border-b border-slate-200/60">
        <div className="absolute inset-0 bg-grid-slate-100/[0.04] bg-[size:20px_20px]" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 lg:py-16">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 bg-white/80 backdrop-blur-sm border border-primary-200/60 rounded-full px-4 py-1.5 mb-4">
              <GraduationCap className="w-4 h-4 text-primary-600" />
              <span className="text-xs font-semibold text-primary-700 uppercase tracking-wider">
                {t('subjects.page.hero.badge', { defaultValue: 'Programme officiel tunisien' })}
              </span>
            </div>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-slate-900 mb-4 leading-tight">
              {t('subjects.page.hero.h1a', { defaultValue: 'Toutes les ' })}
              <span className="relative inline-block">
                <span className="relative z-10 bg-gradient-to-r from-primary-600 to-sky-500 bg-clip-text text-transparent">
                  {t('subjects.page.hero.h1b', { defaultValue: 'matières' })}
                </span>
              </span>
            </h1>
            <p className="text-lg text-slate-600 leading-relaxed mb-6">
              {t('subjects.page.hero.subtitle', {
                count: total,
                defaultValue: 'Explorez {count} matières du programme tunisien',
              })}
            </p>

            <div className="flex flex-wrap items-center gap-3 mb-4">
              <div className="inline-flex items-center gap-2 bg-white border border-slate-200 rounded-full px-4 py-2">
                <Sparkles className="w-4 h-4 text-amber-500" />
                <span className="text-sm">
                  <strong className="font-bold text-slate-900">{total}</strong>
                  <span className="text-slate-500"> {t('subjects.page.hero.matieres', { defaultValue: 'matières' })}</span>
                </span>
              </div>
              <div className="inline-flex items-center gap-2 bg-white border border-slate-200 rounded-full px-4 py-2">
                <BookOpen className="w-4 h-4 text-sky-500" />
                <span className="text-sm">
                  <strong className="font-bold text-slate-900">
                    {totalResources.toLocaleString('fr-FR')}
                  </strong>
                  <span className="text-slate-500"> {t('subjects.page.hero.ressources', { defaultValue: 'ressources' })}</span>
                </span>
              </div>
              <span className="text-sm text-slate-600">{t('subjects.page.hero.gratuit', { defaultValue: '100% gratuit' })}</span>
            </div>
          </div>
        </div>
      </section>

      {/* Subjects grid */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {subjects.map((s) => {
            const cfg = getSubjectConfig(s.slug);
            const Icon = cfg ? (SUBJECT_ICONS[cfg.design?.iconName] ?? BookOpen) : BookOpen;
            const color = cfg?.color ?? s.color ?? '#0EA5E9';
            const emoji = cfg?.design?.emoji ?? '📚';
            const gradient = cfg?.design?.gradient ?? 'from-slate-100 to-slate-50';

            return (
              <Link
                key={s.id}
                href={`/matieres/${s.slug}`}
                className="group relative flex flex-col items-center text-center p-5 lg:p-6 bg-white border border-slate-200 rounded-2xl shadow-sm hover:shadow-xl hover:-translate-y-1 hover:border-slate-300 transition-all duration-300 overflow-hidden"
              >
                <div
                  className="absolute top-0 left-0 right-0 h-1 origin-left scale-x-0 group-hover:scale-x-100 transition-transform duration-300"
                  style={{ background: color }}
                />
                <div
                  className={`absolute inset-0 bg-gradient-to-br ${gradient} opacity-0 group-hover:opacity-60 transition-opacity duration-300 pointer-events-none`}
                />
                <div
                  className="relative w-16 h-16 lg:w-20 lg:h-20 rounded-2xl flex items-center justify-center mb-4 transition-all duration-300 group-hover:scale-110 group-hover:rotate-3"
                  style={{
                    background: `${color}1A`,
                    boxShadow: `0 6px 16px -6px ${color}55`,
                  }}
                >
                  <Icon className="w-8 h-8 lg:w-10 lg:h-10" style={{ color }} strokeWidth={1.5} />
                  <span className="absolute -top-1 -right-1 text-2xl">{emoji}</span>
                </div>
                <h2 className="text-base lg:text-lg font-bold text-slate-900 group-hover:text-primary-700 transition-colors leading-tight mb-1">
                  {getLocalizedName(s, locale)}
                </h2>
                <div className="flex items-center gap-1 text-xs text-slate-500">
                  <span className="font-semibold text-slate-700">{s.resourceCount.toLocaleString('fr-FR')}</span>
                  <span>{t('subjects.page.grid.ressources', { defaultValue: 'ressources' })}</span>
                </div>
                <div className="mt-3 text-xs font-medium text-primary-600 opacity-0 group-hover:opacity-100 transition-opacity">
                  {t('subjects.page.grid.voir', { defaultValue: 'Voir' })} <ArrowRight className="w-3 h-3 inline" />
                </div>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
