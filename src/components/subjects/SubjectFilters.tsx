'use client';

import { useRouter, usePathname } from '@/i18n/navigation';
import { useCallback } from 'react';
import { X, Users, BookOpen, BookText, Filter } from 'lucide-react';

interface FilterOption {
  slug: string;
  label: string;
  emoji?: string;
}

interface SubjectFiltersProps {
  subjectSlug: string;
  classes: { id: string; nameFr: string; slug: string | null; order: number }[];
  sections: { id: string; name: string; slug: string; class: { nameFr: string } }[];
  teachers: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    firstNameAr: string | null;
    lastNameAr: string | null;
    avatarUrl: string | null;
    schoolName: string | null;
  }[];
  resourceTypes: FilterOption[];
  trimesters: FilterOption[];
  facets: {
    byType: Record<string, number>;
    byTrimestre: Record<string, number>;
    byAnnee: Record<string, number>;
  };
  activeFilters: Record<string, string | undefined>;
  totalCount: number;
}

/**
 * Barre de filtres laterale pour /matieres/[subject]
 * URL-driven : tous les filtres sont dans query string → SEO-friendly
 *  Année | Section | Type | Trimestre | Prof | Reset
 */
export default function SubjectFilters({
  subjectSlug,
  classes,
  sections,
  teachers,
  resourceTypes,
  trimesters,
  facets,
  activeFilters,
  totalCount,
}: SubjectFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();

  const update = useCallback(
    (key: string, value: string | null) => {
      const params = new URLSearchParams(
        typeof window !== 'undefined' ? window.location.search : '',
      );
      if (!value) {
        params.delete(key);
      } else {
        params.set(key, value);
      }
      params.delete('page'); // reset pagination
      router.push(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [router, pathname],
  );

  const resetAll = () => router.push(pathname, { scroll: false });

  const hasActiveFilters = Object.values(activeFilters).some(Boolean);

  return (
    <div className="bg-white rounded-2xl border border-slate-200 sticky top-24 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-slate-600" />
          <h3 className="font-bold text-sm">Filtres</h3>
        </div>
        {hasActiveFilters && (
          <button
            onClick={resetAll}
            className="text-xs text-red-600 hover:text-red-700 font-medium flex items-center gap-1"
          >
            <X className="w-3 h-3" /> Tout effacer
          </button>
        )}
      </div>

      <div className="p-4 space-y-6">
        {/* Année scolaire */}
        <FilterGroup title="Année scolaire" icon={BookOpen}>
          <div className="space-y-1">
            {classes.map((c) => {
              const sl = c.slug ?? c.nameFr.toLowerCase();
              const count = facets.byAnnee[sl] ?? 0;
              const active = activeFilters.annee === sl;
              return (
                <FilterRow
                  key={c.id}
                  active={active}
                  onClick={() => update('annee', active ? null : sl)}
                  label={c.nameFr}
                  count={count}
                />
              );
            })}
          </div>
        </FilterGroup>

        {/* Section */}
        {sections.length > 0 && (
          <FilterGroup title="Section" icon={Filter}>
            <div className="space-y-1">
              {sections.map((s) => {
                const active = activeFilters.section === s.slug;
                return (
                  <FilterRow
                    key={s.id}
                    active={active}
                    onClick={() => update('section', active ? null : s.slug)}
                    label={s.name}
                    sublabel={s.class.nameFr}
                  />
                );
              })}
            </div>
          </FilterGroup>
        )}

        {/* Type */}
        <FilterGroup title="Type de ressource" icon={BookText}>
          <div className="space-y-1">
            {resourceTypes.map((t) => {
              const active = activeFilters.type === t.slug;
              const count = facets.byType[t.slug] ?? 0;
              return (
                <FilterRow
                  key={t.slug}
                  active={active}
                  onClick={() => update('type', active ? null : t.slug)}
                  label={t.label}
                  emoji={t.emoji}
                  count={count}
                />
              );
            })}
          </div>
        </FilterGroup>

        {/* Trimestre */}
        <FilterGroup title="Trimestre" icon={Filter}>
          <div className="grid grid-cols-3 gap-2">
            {trimesters.map((tr) => {
              const active = activeFilters.trimestre === tr.slug;
              const count = facets.byTrimestre[tr.slug] ?? 0;
              return (
                <button
                  key={tr.slug}
                  onClick={() => update('trimestre', active ? null : tr.slug)}
                  className={`py-2 rounded-lg text-sm font-medium border transition ${
                    active
                      ? 'bg-primary-600 text-white border-primary-600'
                      : 'bg-white text-slate-700 border-slate-200 hover:border-primary-300'
                  }`}
                >
                  T{tr.slug}
                  {count > 0 && <span className="block text-[10px] opacity-70">{count}</span>}
                </button>
              );
            })}
          </div>
        </FilterGroup>

        {/* Prof */}
        {teachers.length > 0 && (
          <FilterGroup title="Professeur" icon={Users}>
            <div className="space-y-1 max-h-64 overflow-y-auto">
              {teachers.slice(0, 12).map((t) => {
                const active = activeFilters.prof === t.id;
                const name =
                  [t.firstName, t.lastName].filter(Boolean).join(' ') || t.firstNameAr || 'Prof';
                return (
                  <button
                    key={t.id}
                    onClick={() => update('prof', active ? null : t.id)}
                    className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left text-sm transition ${
                      active
                        ? 'bg-primary-100 text-primary-900'
                        : 'hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    {t.avatarUrl ? (
                      <img src={t.avatarUrl} alt="" className="w-6 h-6 rounded-full object-cover" />
                    ) : (
                      <div className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center text-[10px] font-bold text-slate-600">
                        {name.charAt(0)}
                      </div>
                    )}
                    <span className="truncate flex-1">{name}</span>
                  </button>
                );
              })}
              {teachers.length > 12 && (
                <div className="text-xs text-slate-500 px-2 pt-1">
                  +{teachers.length - 12} autres professeurs
                </div>
              )}
            </div>
          </FilterGroup>
        )}

        {/* Total bottom */}
        <div className="pt-3 border-t border-slate-100 text-center">
          <div className="text-2xl font-bold text-slate-900" suppressHydrationWarning>
            {totalCount.toLocaleString('fr-FR')}
          </div>
          <div className="text-xs text-slate-500">ressources trouvées</div>
        </div>
      </div>
    </div>
  );
}

function FilterGroup({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-2">
        <Icon className="w-3.5 h-3.5 text-slate-500" />
        <h4 className="font-semibold text-xs text-slate-700 uppercase tracking-wide">{title}</h4>
      </div>
      {children}
    </div>
  );
}

function FilterRow({
  active,
  onClick,
  label,
  sublabel,
  emoji,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  sublabel?: string;
  emoji?: string;
  count?: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left text-sm transition ${
        active
          ? 'bg-primary-100 text-primary-900 font-semibold'
          : 'hover:bg-slate-50 text-slate-700'
      }`}
    >
      {emoji && <span className="text-sm">{emoji}</span>}
      <span className="truncate flex-1">{label}</span>
      {sublabel && <span className="text-[10px] text-slate-400">{sublabel}</span>}
      {count !== undefined && count > 0 && (
        <span
          className={`text-[10px] px-1.5 py-0.5 rounded-full ${active ? 'bg-primary-200 text-primary-900' : 'bg-slate-100 text-slate-500'}`}
        >
          {count}
        </span>
      )}
    </button>
  );
}
