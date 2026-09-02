'use client';

import { useState, useMemo } from 'react';
import {
  Download,
  FileText,
  CheckCircle,
  Search,
  X,
  ChevronDown,
  Calendar,
  Sparkles,
} from 'lucide-react';
import { useTranslations, useLocale } from 'next-intl';

type BacFile = {
  url: string;
  subject: string; // subject slug (mathematiques, physique, etc.)
  subjectName: string; // localized name FR
  subjectNameAr?: string; // localized name AR
  type: 'sujets' | 'corriges';
  session: 'principale' | 'controle';
  section: string; // section slug
};

type ArchiveYearGroup = {
  year: number;
  total: number;
  sujets: number;
  corriges: number;
  sections: {
    [sectionSlug: string]: {
      [sessionCode: string]: Array<BacFile | { subject: string }>;
    };
  };
};

const SECTION_DISPLAY: Record<
  string,
  { icon: string; nameFr: string; nameAr: string; color: string }
> = {
  math: { icon: '📐', nameFr: 'Mathématiques', nameAr: 'الرياضيات', color: 'blue' },
  'sc-exp': {
    icon: '🧪',
    nameFr: 'Sciences Expérimentales',
    nameAr: 'العلوم التجريبية',
    color: 'emerald',
  },
  'sc-tech': {
    icon: '⚙️',
    nameFr: 'Sciences Techniques',
    nameAr: 'العلوم التقنية',
    color: 'slate',
  },
  'sc-info': {
    icon: '💻',
    nameFr: 'Sciences Informatiques',
    nameAr: 'علوم الإعلامية',
    color: 'indigo',
  },
  'eco-gestion': {
    icon: '💼',
    nameFr: 'Économie et Gestion',
    nameAr: 'الاقتصاد والتصرف',
    color: 'amber',
  },
  lettres: { icon: '📚', nameFr: 'Lettres', nameAr: 'الآداب', color: 'purple' },
  sport: { icon: '⚽', nameFr: 'Sport', nameAr: 'الرياضة', color: 'orange' },
};

export function BacArchivesClient({
  yearGroups,
  allYearGroups,
  totalFiles,
}: {
  yearGroups: ArchiveYearGroup[];
  allYearGroups: ArchiveYearGroup[];
  totalFiles: number;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const isAr = locale === 'ar';

  const [searchQuery, setSearchQuery] = useState('');
  const [yearFilter, setYearFilter] = useState<string>('');
  const [sectionFilter, setSectionFilter] = useState<string>('');
  const [subjectFilter, setSubjectFilter] = useState<string>('');
  const [sessionFilter, setSessionFilter] = useState<string>('');
  const [typeFilter, setTypeFilter] = useState<string>('');
  const [openYears, setOpenYears] = useState<Set<number>>(new Set([yearGroups[0]?.year]));

  // Available years from ALL groups (for filter dropdown)
  const availableYears = useMemo(() => {
    return allYearGroups.map((yg) => yg.year).sort((a, b) => b - a);
  }, [allYearGroups]);

  // Available sections from ALL groups
  const availableSections = useMemo(() => {
    const sections = new Set<string>();
    for (const yg of allYearGroups) {
      for (const s of Object.keys(yg.sections)) {
        sections.add(s);
      }
    }
    return Array.from(sections).sort();
  }, [allYearGroups]);

  // Available subjects from ALL groups
  const availableSubjects = useMemo(() => {
    const subjects = new Map<string, string>(); // slug → display name
    for (const yg of allYearGroups) {
      for (const sectionSessions of Object.values(yg.sections)) {
        for (const files of Object.values(sectionSessions)) {
          for (const f of files) {
            if (f.subject && !subjects.has(f.subject)) {
              subjects.set(f.subject, (f as BacFile).subjectName || f.subject);
            }
          }
        }
      }
    }
    return Array.from(subjects.entries())
      .map(([slug, nameFr]) => ({ slug, nameFr, nameAr: '', icon: '📄' }))
      .sort((a, b) => a.nameFr.localeCompare(b.nameFr));
  }, [allYearGroups]);

  const filteredGroups = useMemo(() => {
    return yearGroups
      .map((yg) => {
        if (yearFilter && yg.year !== parseInt(yearFilter, 10)) return null;
        const filteredSections: any = {};
        for (const [section, sessions] of Object.entries(yg.sections)) {
          if (sectionFilter && section !== sectionFilter) continue;
          const filteredSessions: any = {};
          for (const [session, files] of Object.entries(sessions)) {
            if (sessionFilter && session !== sessionFilter) continue;
            let filtered: any = files;
            if (typeFilter === 'sujet') {
              filtered = filtered.filter((f: any) => f.type === 'sujets');
            } else if (typeFilter === 'corrige') {
              filtered = filtered.filter((f: any) => f.type === 'corriges');
            }
            if (subjectFilter) {
              filtered = filtered.filter((f: any) => f.subject === subjectFilter);
            }
            if (searchQuery) {
              const q = searchQuery.toLowerCase();
              filtered = filtered.filter((f: any) => {
                const searchStr =
                  `${yg.year} ${section} ${session} ${f.subject} ${f.type} ${f.subjectName || ''}`.toLowerCase();
                return searchStr.includes(q);
              });
            }
            if (filtered.length === 0) continue;
            filteredSessions[session] = filtered;
          }
          if (Object.keys(filteredSessions).length > 0) {
            filteredSections[section] = filteredSessions;
          }
        }
        if (Object.keys(filteredSections).length === 0) return null;
        return { ...yg, sections: filteredSections };
      })
      .filter((yg): yg is ArchiveYearGroup => yg !== null);
  }, [
    yearGroups,
    yearFilter,
    sectionFilter,
    subjectFilter,
    sessionFilter,
    typeFilter,
    searchQuery,
  ]);

  const totalFiltered = filteredGroups.reduce(
    (s, yg) =>
      s +
      Object.values(yg.sections).reduce(
        (ss, sessions) =>
          ss + Object.values(sessions).reduce((sss, files) => sss + files.length, 0),
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
    setSectionFilter('');
    setSubjectFilter('');
    setSessionFilter('');
    setTypeFilter('');
  };

  const hasActiveFilters =
    searchQuery || yearFilter || sectionFilter || subjectFilter || sessionFilter || typeFilter;

  // Subject label helper
  const subjectLabel = (slug: string, fr?: string, ar?: string): string => {
    if (isAr && ar) return ar;
    return fr || slug;
  };

  // Session label
  const sessionLabel = (s: string) => {
    if (s === 'principale') return isAr ? 'الدورة الرئيسية' : 'Principale';
    if (s === 'controle') return isAr ? 'دورة المراقبة' : 'Contrôle';
    return s;
  };

  // Session short tag
  const sessionTag = (s: string) => {
    if (s === 'principale') return isAr ? 'د.ر' : 'P';
    if (s === 'controle') return isAr ? 'د.م' : 'C';
    return s;
  };

  // Type label
  const typeLabel = (type?: string) => {
    if (type === 'sujets') return isAr ? 'موضوع' : 'Sujet';
    if (type === 'corriges') return isAr ? 'إصلاح' : 'Corrigé';
    return type || '';
  };

  return (
    <>
      {/* STICKY FILTER BAR */}
      <section className="sticky top-20 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200 py-4 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col lg:flex-row gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="search"
                placeholder={
                  isAr
                    ? 'بحث في الأرشيف (مادة، شعبة، سنة...)'
                    : 'Rechercher (matière, section, année...)'
                }
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 focus:border-violet-400 focus:ring-2 focus:ring-violet-100 outline-none text-sm"
              />
            </div>

            <select
              value={yearFilter}
              onChange={(e) => setYearFilter(e.target.value)}
              className="px-3 py-2.5 rounded-xl border border-slate-200 focus:border-violet-400 outline-none text-sm bg-white"
            >
              <option value="">{isAr ? 'كل السنوات' : 'Toutes les années'}</option>
              {availableYears.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>

            <select
              value={sectionFilter}
              onChange={(e) => setSectionFilter(e.target.value)}
              className="px-3 py-2.5 rounded-xl border border-slate-200 focus:border-violet-400 outline-none text-sm bg-white"
            >
              <option value="">{isAr ? 'كل الشعب' : 'Toutes les sections'}</option>
              {availableSections.map((s) => (
                <option key={s} value={s}>
                  {SECTION_DISPLAY[s]?.icon}{' '}
                  {isAr ? SECTION_DISPLAY[s]?.nameAr : SECTION_DISPLAY[s]?.nameFr}
                </option>
              ))}
            </select>

            <select
              value={subjectFilter}
              onChange={(e) => setSubjectFilter(e.target.value)}
              className="px-3 py-2.5 rounded-xl border border-slate-200 focus:border-violet-400 outline-none text-sm bg-white"
            >
              <option value="">{isAr ? 'كل المواد' : 'Toutes les matières'}</option>
              {availableSubjects.map((s) => (
                <option key={s.slug} value={s.slug}>
                  {s.nameFr}
                </option>
              ))}
            </select>

            <select
              value={sessionFilter}
              onChange={(e) => setSessionFilter(e.target.value)}
              className="px-3 py-2.5 rounded-xl border border-slate-200 focus:border-violet-400 outline-none text-sm bg-white"
            >
              <option value="">{isAr ? 'كل الدورات' : 'Toutes les sessions'}</option>
              <option value="principale">{isAr ? 'الدورة الرئيسية' : 'Session Principale'}</option>
              <option value="controle">{isAr ? 'دورة المراقبة' : 'Session Contrôle'}</option>
            </select>

            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="px-3 py-2.5 rounded-xl border border-slate-200 focus:border-violet-400 outline-none text-sm bg-white"
            >
              <option value="">{isAr ? 'كل الأنواع' : 'Tous les types'}</option>
              <option value="sujet">{isAr ? 'المواضيع فقط' : 'Sujets seulement'}</option>
              <option value="corrige">{isAr ? 'الإصلاحات فقط' : 'Corrigés seulement'}</option>
            </select>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 mt-3">
            <div className="text-sm text-slate-600">
              {hasActiveFilters ? (
                <span>
                  <strong className="text-violet-700" suppressHydrationWarning>
                    {totalFiltered.toLocaleString(isAr ? 'ar-EG' : 'fr-FR')}
                  </strong>{' '}
                  {isAr ? 'ملف يطابق البحث' : 'fichiers trouvés'}
                  <span className="text-slate-400" suppressHydrationWarning>
                    {' '}
                    / {totalFiles.toLocaleString(isAr ? 'ar-EG' : 'fr-FR')}
                  </span>
                </span>
              ) : (
                <span>
                  <strong className="text-violet-700" suppressHydrationWarning>
                    {totalFiles.toLocaleString(isAr ? 'ar-EG' : 'fr-FR')}
                  </strong>{' '}
                  {isAr ? 'ملف في' : 'fichiers sur'} <strong>{yearGroups.length}</strong>{' '}
                  {isAr ? 'سنة' : 'ans'}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {hasActiveFilters && (
                <button
                  onClick={clearFilters}
                  className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 px-2 py-1"
                >
                  <X className="w-3 h-3" /> {isAr ? 'إعادة التعيين' : 'Réinitialiser'}
                </button>
              )}
              <button
                onClick={expandAll}
                className="text-xs text-violet-600 hover:text-violet-700 font-semibold px-2 py-1"
              >
                {isAr ? 'توسيع الكل' : 'Tout étendre'}
              </button>
              <span className="text-slate-300">|</span>
              <button
                onClick={collapseAll}
                className="text-xs text-violet-600 hover:text-violet-700 font-semibold px-2 py-1"
              >
                {isAr ? 'طي الكل' : 'Tout replier'}
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
                {isAr ? 'لا توجد نتائج' : 'Aucun résultat'}
              </h3>
              <p className="text-slate-600 mb-4">
                {isAr
                  ? 'حاول تعديل المرشحات للعثور على ما تبحث عنه.'
                  : 'Essayez de modifier les filtres pour trouver ce que vous cherchez.'}
              </p>
              <button
                onClick={clearFilters}
                className="px-4 py-2 bg-violet-600 text-white rounded-xl hover:bg-violet-700 transition text-sm font-semibold"
              >
                {isAr ? 'إعادة تعيين المرشحات' : 'Réinitialiser les filtres'}
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredGroups.map((yg) => {
                const isOpen = openYears.has(yg.year);
                const sectionCount = Object.keys(yg.sections).length;
                const sessionCount = Object.values(yg.sections).reduce(
                  (s, sessions) => s + Object.keys(sessions).length,
                  0,
                );

                return (
                  <details
                    key={yg.year}
                    open={isOpen}
                    className="group bg-white rounded-2xl border border-slate-200 hover:border-violet-300 transition shadow-sm"
                  >
                    <summary
                      onClick={(e) => {
                        e.preventDefault();
                        toggleYear(yg.year);
                      }}
                      className="cursor-pointer p-5 flex items-center justify-between gap-3 list-none"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-violet-500 to-purple-700 text-white font-extrabold text-xl flex items-center justify-center flex-shrink-0">
                          {String(yg.year).slice(-2)}
                        </div>
                        <div>
                          <div className="font-bold text-lg text-slate-900">
                            {isAr ? `باكالوريا ${yg.year}` : `Bac ${yg.year}`}
                          </div>
                          <div className="text-xs text-slate-500 flex items-center gap-3 flex-wrap">
                            <span className="inline-flex items-center gap-1">
                              <Calendar className="w-3 h-3" /> {yg.total}{' '}
                              {isAr ? 'ملف' : 'fichiers'}
                            </span>
                            <span className="text-slate-300">•</span>
                            <span>
                              {yg.sujets} {isAr ? 'موضوع' : 'sujets'}
                            </span>
                            <span className="text-slate-300">•</span>
                            <span className="text-amber-600 font-semibold">
                              {yg.corriges} {isAr ? 'إصلاح' : 'corrigés'}
                            </span>
                            <span className="text-slate-300">•</span>
                            <span>
                              {sectionCount} {isAr ? 'شعب' : 'sections'}
                            </span>
                          </div>
                        </div>
                      </div>
                      <ChevronDown
                        className={`w-5 h-5 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''} flex-shrink-0`}
                      />
                    </summary>

                    {isOpen && (
                      <div className="px-5 pb-5 border-t border-slate-100 pt-4 space-y-4">
                        {Object.entries(yg.sections).map(([sectionSlug, sessions]) => {
                          const sec = SECTION_DISPLAY[sectionSlug] || {
                            icon: '📄',
                            nameFr: sectionSlug,
                            nameAr: sectionSlug,
                            color: 'slate',
                          };
                          return (
                            <div
                              key={sectionSlug}
                              className="bg-gradient-to-br from-slate-50 to-white rounded-xl p-4 border border-slate-100"
                            >
                              {/* Section header */}
                              <div className="flex items-center gap-2 mb-3">
                                <div className="text-2xl">{sec.icon}</div>
                                <h3 className="font-extrabold text-slate-900">
                                  {isAr ? sec.nameAr : sec.nameFr}
                                </h3>
                                <div className="flex-1 h-px bg-slate-200" />
                              </div>

                              {/* Sessions */}
                              <div className="space-y-3">
                                {Object.entries(sessions).map(([session, files]) => (
                                  <div
                                    key={session}
                                    className="bg-white rounded-lg p-3 border border-slate-100"
                                  >
                                    <div className="flex items-center gap-2 mb-2">
                                      <span
                                        className={`inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full ${
                                          session === 'principale'
                                            ? 'bg-violet-100 text-violet-700'
                                            : 'bg-amber-100 text-amber-700'
                                        }`}
                                      >
                                        {sessionTag(session)} {sessionLabel(session)}
                                      </span>
                                      <span className="text-xs text-slate-500">
                                        {files.length} {isAr ? 'ملف' : 'fichiers'}
                                      </span>
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
                                      {files.map((f: any, i: number) => {
                                        const isCorrige = f.type === 'corriges';
                                        return (
                                          <a
                                            key={i}
                                            href={f.url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className={`group/item flex items-center justify-between gap-2 rounded-lg px-3 py-2 border-2 transition text-xs font-semibold ${
                                              isCorrige
                                                ? 'bg-white border-emerald-200 text-emerald-700 hover:bg-emerald-50 hover:border-emerald-300'
                                                : 'bg-white border-blue-200 text-blue-700 hover:bg-blue-50 hover:border-blue-300'
                                            }`}
                                          >
                                            <span className="flex items-center gap-1.5 min-w-0 flex-1">
                                              {isCorrige ? (
                                                <CheckCircle className="w-3.5 h-3.5 flex-shrink-0" />
                                              ) : (
                                                <FileText className="w-3.5 h-3.5 flex-shrink-0" />
                                              )}
                                              <span className="truncate">
                                                {subjectLabel(
                                                  f.subject || '',
                                                  f.subjectName,
                                                  f.subjectNameAr,
                                                )}
                                              </span>
                                              {isCorrige && (
                                                <Sparkles className="w-3 h-3 flex-shrink-0" />
                                              )}
                                            </span>
                                            <Download className="w-3.5 h-3.5 flex-shrink-0" />
                                          </a>
                                        );
                                      })}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
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
