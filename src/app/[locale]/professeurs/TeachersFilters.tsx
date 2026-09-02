'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useTransition } from 'react';
import { BookOpen, GraduationCap, CheckCircle2, X } from 'lucide-react';

type SubjectOpt = { slug: string; nameFr: string; nameAr?: string | null; color?: string | null };
type ClassOpt = { slug: string; nameFr: string; nameAr?: string | null };

export default function TeachersFilters({
  subjects,
  classes,
  selectedSubjects,
  selectedClasses,
  verifiedOnly,
}: {
  subjects: SubjectOpt[];
  classes: ClassOpt[];
  selectedSubjects: string[];
  selectedClasses: string[];
  verifiedOnly: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  function navigate(next: Record<string, string | undefined>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v) params.set(k, v);
      else params.delete(k);
    }
    params.delete('page'); // reset pagination on filter change
    startTransition(() => {
      router.push(`/professeurs?${params.toString()}`);
    });
  }

  function toggleSubject(slug: string) {
    const set = new Set(selectedSubjects);
    if (set.has(slug)) set.delete(slug);
    else set.add(slug);
    navigate({ subject: set.size ? Array.from(set).join(',') : '' });
  }

  function toggleClass(slug: string) {
    const set = new Set(selectedClasses);
    if (set.has(slug)) set.delete(slug);
    else set.add(slug);
    navigate({ class: set.size ? Array.from(set).join(',') : '' });
  }

  const hasFilters = selectedSubjects.length > 0 || selectedClasses.length > 0 || verifiedOnly;

  return (
    <div className="space-y-6">
      <FilterGroup icon={CheckCircle2} title="Statut">
        <label className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-50 cursor-pointer transition">
          <input
            type="checkbox"
            checked={verifiedOnly}
            onChange={(e) => navigate({ verified: e.target.checked ? '1' : '' })}
            className="w-4 h-4 text-amber-500 border-slate-300 rounded focus:ring-amber-400 focus:ring-offset-0"
          />
          <span className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
            Vérifiés uniquement
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
          </span>
        </label>
      </FilterGroup>

      <FilterGroup icon={BookOpen} title="Matière enseignée" badge={selectedSubjects.length}>
        {subjects.length === 0 ? (
          <p className="text-xs text-slate-400 px-3 py-2">Aucune matière disponible</p>
        ) : (
          <ul className="space-y-0.5">
            {subjects.map((s) => {
              const active = selectedSubjects.includes(s.slug);
              return (
                <li key={s.slug}>
                  <button
                    type="button"
                    onClick={() => toggleSubject(s.slug)}
                    className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-sm transition ${
                      active
                        ? 'bg-amber-100 text-amber-800 font-semibold'
                        : 'hover:bg-slate-50 text-slate-600'
                    }`}
                  >
                    <span className="flex items-center gap-2 truncate">
                      <span
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ background: s.color || '#0EA5E9' }}
                      />
                      <span className="truncate">{s.nameFr}</span>
                    </span>
                    {active && <span className="text-amber-600 text-xs">✓</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </FilterGroup>

      <FilterGroup icon={GraduationCap} title="Niveau" badge={selectedClasses.length}>
        {classes.length === 0 ? (
          <p className="text-xs text-slate-400 px-3 py-2">Aucun niveau disponible</p>
        ) : (
          <ul className="space-y-0.5">
            {classes.map((c) => {
              const active = selectedClasses.includes(c.slug);
              return (
                <li key={c.slug}>
                  <button
                    type="button"
                    onClick={() => toggleClass(c.slug)}
                    className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-sm transition ${
                      active
                        ? 'bg-amber-100 text-amber-800 font-semibold'
                        : 'hover:bg-slate-50 text-slate-600'
                    }`}
                  >
                    <span className="truncate">{c.nameFr}</span>
                    {active && <span className="text-amber-600 text-xs">✓</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </FilterGroup>

      {hasFilters && (
        <button
          type="button"
          onClick={() => navigate({ subject: '', class: '', verified: '', q: '' })}
          className="w-full flex items-center justify-center gap-1.5 text-sm text-slate-500 hover:text-rose-600 py-2 transition"
        >
          <X className="w-4 h-4" />
          Tout effacer
        </button>
      )}
    </div>
  );
}

function FilterGroup({
  icon: Icon,
  title,
  badge,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  badge?: number;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h3 className="flex items-center justify-between gap-2 text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 px-3">
        <span className="flex items-center gap-1.5">
          <Icon className="w-3.5 h-3.5" />
          {title}
        </span>
        {badge ? (
          <span className="bg-amber-100 text-amber-700 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
            {badge}
          </span>
        ) : null}
      </h3>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}
