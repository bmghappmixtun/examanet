'use client';

import { useState, useMemo } from 'react';
import {
  Download,
  FileText,
  CheckCircle,
  Star,
  Search,
  X,
  ChevronDown,
  Calendar,
} from 'lucide-react';
import { useTranslations, useLocale } from 'next-intl';

type ConcoursFile = {
  key: string;
  url: string;
  size: number;
  source?: string;
  note?: string;
};

type YearGroup = {
  year: number;
  voies: {
    [voie: string]: {
      [subject: string]: {
        sujet?: ConcoursFile;
        corrige?: ConcoursFile;
        sujetPlusCorrige?: ConcoursFile;
      };
    };
  };
};

export function ConcoursSujetsClient({
  yearGroups,
  allYearGroups,
  totalFiles,
}: {
  yearGroups: YearGroup[];
  allYearGroups: YearGroup[];
  totalFiles: number;
}) {
  const t = useTranslations();
  const [searchQuery, setSearchQuery] = useState('');
  const [yearFilter, setYearFilter] = useState<string>('');
  const [subjectFilter, setSubjectFilter] = useState<string>('');
  const [voieFilter, setVoieFilter] = useState<string>('');
  const [typeFilter, setTypeFilter] = useState<string>('');
  const [openYears, setOpenYears] = useState<Set<number>>(new Set([yearGroups[0]?.year]));

  // Subject display config (icon/color only - labels from i18n)
  const SUBJECT_DISPLAY: Record<string, { icon: string }> = {
    math: { icon: '📐' },
    arabe: { icon: '📚' },
    francais: { icon: '📖' },
    svt: { icon: '🧬' },
    physique: { icon: '⚛️' },
    anglais: { icon: '🌍' },
    histoire: { icon: '🏛️' },
  };

  const availableSubjects = useMemo(() => {
    const subjects = new Set<string>();
    for (const yg of allYearGroups) {
      for (const subjects2 of Object.values(yg.voies)) {
        for (const subject of Object.keys(subjects2)) {
          subjects.add(subject);
        }
      }
    }
    return Array.from(subjects).sort();
  }, [allYearGroups]);

  const filteredGroups = useMemo(() => {
    return yearGroups
      .map((yg) => {
        if (yearFilter && yg.year !== parseInt(yearFilter, 10)) return null;
        const filteredVoies: any = {};
        for (const [voie, subjects] of Object.entries(yg.voies)) {
          if (voieFilter && voie !== voieFilter) continue;
          const filteredSubjects: any = {};
          for (const [subject, files] of Object.entries(subjects)) {
            if (subjectFilter && subject !== subjectFilter) continue;
            const filtered: any = { ...files };
            if (typeFilter === 'sujet' && !files.sujet) delete filtered.sujet;
            if (typeFilter === 'corrige' && !files.corrige && !files.sujetPlusCorrige) {
              delete filtered.corrige;
              delete filtered.sujetPlusCorrige;
            }
            if (Object.keys(filtered).length === 0) continue;
            if (searchQuery) {
              const searchStr =
                `${yg.year} ${subject} ${voie} ${Object.keys(filtered).join(' ')}`.toLowerCase();
              if (!searchStr.includes(searchQuery.toLowerCase())) continue;
            }
            filteredSubjects[subject] = filtered;
          }
          if (Object.keys(filteredSubjects).length > 0) {
            filteredVoies[voie] = filteredSubjects;
          }
        }
        if (Object.keys(filteredVoies).length === 0) return null;
        return { ...yg, voies: filteredVoies };
      })
      .filter((yg): yg is YearGroup => yg !== null);
  }, [yearGroups, yearFilter, subjectFilter, voieFilter, typeFilter, searchQuery]);

  const totalFiltered = filteredGroups.reduce(
    (s, yg) =>
      s +
      Object.values(yg.voies).reduce(
        (ss, subjects) =>
          ss +
          Object.values(subjects).reduce(
            (sss, files) =>
              sss +
              (files.sujet ? 1 : 0) +
              (files.corrige ? 1 : 0) +
              (files.sujetPlusCorrige ? 1 : 0),
            0,
          ),
        0,
      ),
    0,
  );

  const toggleYear = (year: number) => {
    setOpenYears((prev) => {
      const next = new Set(prev);
      if (next.has(year)) next.delete(year);
      else next.add(year);
      return next;
    });
  };

  const expandAll = () => setOpenYears(new Set(filteredGroups.map((yg) => yg.year)));
  const collapseAll = () => setOpenYears(new Set());
  const clearFilters = () => {
    setSearchQuery('');
    setYearFilter('');
    setSubjectFilter('');
    setVoieFilter('');
    setTypeFilter('');
  };

  const hasActiveFilters = searchQuery || yearFilter || subjectFilter || voieFilter || typeFilter;

  // Subject label helper
  const subjectLabel = (slug: string): string => {
    const map: Record<string, string> = {
      math: t('subjects.math') || 'Mathématiques',
      arabe: t('subjects.arabe') || 'Arabe',
      francais: t('subjects.francais') || 'Français',
      svt: t('subjects.svt') || 'SVT',
      physique: t('subjects.physique') || 'Physique',
      anglais: t('subjects.anglais') || 'Anglais',
      histoire: t('subjects.histoire') || 'Histoire',
    };
    return map[slug] || slug;
  };

  const voieLabel = (voie: string) =>
    voie === 'general'
      ? t('concours.passes.cards.voieGenerale')
      : t('concours.passes.cards.voieTechnique');

  return (
    <>
      {/* FILTER BAR */}
      <section className="sticky top-20 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200 py-4 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col lg:flex-row gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="search"
                placeholder={t('concours.passes.filters.search')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 focus:border-primary-400 focus:ring-2 focus:ring-primary-100 outline-none text-sm"
              />
            </div>

            <select
              value={yearFilter}
              onChange={(e) => setYearFilter(e.target.value)}
              className="px-3 py-2.5 rounded-xl border border-slate-200 focus:border-primary-400 outline-none text-sm bg-white"
            >
              <option value="">{t('concours.passes.filters.allYears')}</option>
              {allYearGroups.map((yg) => (
                <option key={yg.year} value={yg.year}>
                  {yg.year}
                </option>
              ))}
            </select>

            <select
              value={subjectFilter}
              onChange={(e) => setSubjectFilter(e.target.value)}
              className="px-3 py-2.5 rounded-xl border border-slate-200 focus:border-primary-400 outline-none text-sm bg-white"
            >
              <option value="">{t('concours.passes.filters.allMatieres')}</option>
              {availableSubjects.map((s) => (
                <option key={s} value={s}>
                  {SUBJECT_DISPLAY[s]?.icon} {subjectLabel(s)}
                </option>
              ))}
            </select>

            <select
              value={voieFilter}
              onChange={(e) => setVoieFilter(e.target.value)}
              className="px-3 py-2.5 rounded-xl border border-slate-200 focus:border-primary-400 outline-none text-sm bg-white"
            >
              <option value="">{t('concours.passes.filters.allVoies')}</option>
              <option value="general">{t('concours.passes.filters.voieGenerale')}</option>
              <option value="technique">{t('concours.passes.filters.voieTechnique')}</option>
            </select>

            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="px-3 py-2.5 rounded-xl border border-slate-200 focus:border-primary-400 outline-none text-sm bg-white"
            >
              <option value="">{t('concours.passes.filters.allTypes')}</option>
              <option value="sujet">{t('concours.passes.filters.sujetsOnly')}</option>
              <option value="corrige">{t('concours.passes.filters.corrigesOnly')}</option>
            </select>
          </div>

          <div className="flex items-center justify-between gap-3 mt-3">
            <div className="text-sm text-slate-600">
              {hasActiveFilters ? (
                <span
                  dangerouslySetInnerHTML={{
                    __html: t('concours.passes.actions.resultCount')
                      .replace('{count}', String(totalFiltered))
                      .replace('{total}', String(totalFiles)),
                  }}
                />
              ) : (
                <span
                  dangerouslySetInnerHTML={{
                    __html: t('concours.passes.actions.totalCount')
                      .replace('{total}', String(totalFiles))
                      .replace('{years}', String(yearGroups.length)),
                  }}
                />
              )}
            </div>
            <div className="flex items-center gap-2">
              {hasActiveFilters && (
                <button
                  onClick={clearFilters}
                  className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 px-2 py-1"
                >
                  <X className="w-3 h-3" /> {t('concours.passes.actions.reset')}
                </button>
              )}
              <button
                onClick={expandAll}
                className="text-xs text-primary-600 hover:text-primary-700 font-semibold px-2 py-1"
              >
                {t('concours.passes.actions.expandAll')}
              </button>
              <span className="text-slate-300">|</span>
              <button
                onClick={collapseAll}
                className="text-xs text-primary-600 hover:text-primary-700 font-semibold px-2 py-1"
              >
                {t('concours.passes.actions.collapseAll')}
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* LIST */}
      <section className="py-8 bg-slate-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          {filteredGroups.length === 0 ? (
            <div className="text-center py-16">
              <div className="text-6xl mb-4">🔍</div>
              <h3 className="text-xl font-bold text-slate-900 mb-2">
                {t('concours.passes.noResults.title')}
              </h3>
              <p className="text-slate-600 mb-4">{t('concours.passes.noResults.desc')}</p>
              <button
                onClick={clearFilters}
                className="px-4 py-2 bg-primary-600 text-white rounded-xl hover:bg-primary-700 transition text-sm font-semibold"
              >
                {t('concours.passes.noResults.btn')}
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredGroups.map((yg) => {
                const isOpen = openYears.has(yg.year);
                const yearFileCount = Object.values(yg.voies).reduce(
                  (s, subjects) =>
                    s +
                    Object.values(subjects).reduce(
                      (ss, files) =>
                        ss +
                        (files.sujet ? 1 : 0) +
                        (files.corrige ? 1 : 0) +
                        (files.sujetPlusCorrige ? 1 : 0),
                      0,
                    ),
                  0,
                );

                return (
                  <details
                    key={yg.year}
                    open={isOpen}
                    className="group bg-white rounded-2xl border border-slate-200 hover:border-primary-300 transition shadow-sm"
                  >
                    <summary
                      onClick={(e) => {
                        e.preventDefault();
                        toggleYear(yg.year);
                      }}
                      className="cursor-pointer p-5 flex items-center justify-between gap-3 list-none"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary-100 to-primary-200 text-primary-700 font-extrabold text-lg flex items-center justify-center">
                          {String(yg.year).slice(-2)}
                        </div>
                        <div>
                          <div className="font-bold text-lg text-slate-900">
                            {t('concours.passes.cards.yearHeader').replace(
                              '{year}',
                              String(yg.year),
                            )}
                          </div>
                          <div className="text-xs text-slate-500 flex items-center gap-2">
                            <Calendar className="w-3 h-3" />
                            {t('concours.list.yearFiles').replace('{count}', String(yearFileCount))}
                          </div>
                        </div>
                      </div>
                      <ChevronDown
                        className={`w-5 h-5 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                      />
                    </summary>

                    <div className="px-5 pb-5 border-t border-slate-100 pt-4">
                      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {Object.entries(yg.voies).flatMap(([voie, subjects]) =>
                          Object.entries(subjects).map(([subject, files]) => {
                            const meta = SUBJECT_DISPLAY[subject] || { icon: '📄' };
                            return (
                              <div
                                key={`${voie}-${subject}`}
                                className="flex flex-col gap-2 bg-slate-50 rounded-xl p-4 border border-slate-100 hover:border-primary-200 transition"
                              >
                                <div className="flex items-center gap-2">
                                  <span className="text-2xl">{meta.icon}</span>
                                  <div className="flex-1 min-w-0">
                                    <div className="font-bold text-sm text-slate-900">
                                      {subjectLabel(subject)}
                                    </div>
                                    <div className="text-xs text-slate-500 capitalize">
                                      {voieLabel(voie)}
                                    </div>
                                  </div>
                                </div>
                                <div className="flex flex-col gap-1.5">
                                  {files.sujet && (
                                    <a
                                      href={files.sujet.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="flex items-center justify-between gap-2 bg-white border border-blue-200 text-blue-700 rounded-lg px-3 py-2 hover:bg-blue-50 hover:border-blue-300 transition text-xs font-semibold"
                                    >
                                      <span className="flex items-center gap-1.5">
                                        <FileText className="w-3.5 h-3.5" />{' '}
                                        {t('concours.passes.cards.sujet')}
                                      </span>
                                      <Download className="w-3.5 h-3.5" />
                                    </a>
                                  )}
                                  {files.corrige && (
                                    <a
                                      href={files.corrige.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="flex items-center justify-between gap-2 bg-white border border-emerald-200 text-emerald-700 rounded-lg px-3 py-2 hover:bg-emerald-50 hover:border-emerald-300 transition text-xs font-semibold"
                                    >
                                      <span className="flex items-center gap-1.5">
                                        <CheckCircle className="w-3.5 h-3.5" />{' '}
                                        {t('concours.passes.cards.corrige')}
                                      </span>
                                      <Download className="w-3.5 h-3.5" />
                                    </a>
                                  )}
                                  {files.sujetPlusCorrige && (
                                    <a
                                      href={files.sujetPlusCorrige.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="flex items-center justify-between gap-2 bg-gradient-to-r from-amber-50 to-yellow-50 border-2 border-amber-300 text-amber-800 rounded-lg px-3 py-2 hover:from-amber-100 hover:to-yellow-100 transition text-xs font-bold"
                                    >
                                      <span className="flex items-center gap-1.5">
                                        <Star className="w-3.5 h-3.5 fill-amber-500" />{' '}
                                        {t('concours.passes.cards.sujetCorrige')}
                                      </span>
                                      <Download className="w-3.5 h-3.5" />
                                    </a>
                                  )}
                                </div>
                              </div>
                            );
                          }),
                        )}
                      </div>
                    </div>
                  </details>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </>
  );
}
