'use client';

import { useState, useMemo, useEffect } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import {
  BookOpen,
  Calculator,
  Atom,
  Leaf,
  Cog,
  Globe,
  BookText,
  Brain,
  Landmark,
  Laptop,
  Heart,
  TrendingUp,
  Briefcase,
  ChevronDown,
  Library,
  GraduationCap,
  Layers,
  Link as LinkIcon,
  ExternalLink,
  Sparkles,
} from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { programmeOfficiel, getLevelStats } from '@/lib/programme-officiel';
import type { Level, Subject, Section } from '@/lib/programme-officiel/types';

const SUBJECT_ICONS: Record<string, any> = {
  mathematiques: Calculator,
  physique: Atom,
  svt: Leaf,
  technologie: Cog,
  informatique: Laptop,
  anglais: Globe,
  francais: BookText,
  arabe: BookOpen,
  philosophie: Brain,
  'histoire-geographie': Landmark,
  'education-islamique': Heart,
  economie: TrendingUp,
  gestion: Briefcase,
};

const COLOR_MAP: Record<string, { bg: string; text: string; border: string }> = {
  blue: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
  emerald: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  amber: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
  indigo: { bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-200' },
  cyan: { bg: 'bg-cyan-50', text: 'text-cyan-700', border: 'border-cyan-200' },
  slate: { bg: 'bg-slate-50', text: 'text-slate-700', border: 'border-slate-200' },
  red: { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200' },
  fuchsia: { bg: 'bg-fuchsia-50', text: 'text-fuchsia-700', border: 'border-fuchsia-200' },
  yellow: { bg: 'bg-yellow-50', text: 'text-yellow-700', border: 'border-yellow-200' },
  green: { bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-200' },
  orange: { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200' },
  purple: { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200' },
  pink: { bg: 'bg-pink-50', text: 'text-pink-700', border: 'border-pink-200' },
};

type Tab = 'college' | 'lycee' | 'sources';

export default function ProgrammeOfficielClient() {
  const locale = useLocale();
  const t = useTranslations('programmeOfficiel');
  const isAr = locale === 'ar';

  // Active top tab
  const [activeTab, setActiveTab] = useState<Tab>('college');
  // Active section per level
  const [activeSection, setActiveSection] = useState<Record<string, string>>({});
  // Opened year accordions (all open by default within the active tab)
  const [openYears, setOpenYears] = useState<Set<string>>(new Set(['7eme']));
  // Opened subject cards
  const [openSubjects, setOpenSubjects] = useState<Set<string>>(new Set());

  // Sync with hash for SEO and sharing
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const hash = window.location.hash.replace('#', '');
    if (hash === 'lycee' || hash === 'sources' || hash === 'college') {
      setActiveTab(hash);
    }
    // Open the year in hash if present
    const yearMatch = hash.match(/^year-(.+)$/);
    if (yearMatch) {
      setOpenYears((prev) => new Set(prev).add(yearMatch[1]));
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (activeTab === 'sources') {
      window.history.replaceState(null, '', '#sources');
    } else {
      window.history.replaceState(null, '', `#${activeTab}`);
    }
  }, [activeTab]);

  const yearMap: Record<string, { fr: string; ar: string }> = {
    '7eme': { fr: '7ème année', ar: 'السنة السابعة' },
    '8eme': { fr: '8ème année', ar: 'السنة الثامنة' },
    '9eme': { fr: '9ème année', ar: 'السنة التامنة' },
    '1AS': { fr: '1ère année (1AS)', ar: 'الأولى ثانوي' },
    '2AS': { fr: '2ème année (2AS)', ar: 'الثانية ثانوي' },
    '3AS': { fr: '3ème année (3AS)', ar: 'الثالثة ثانوي' },
    '4AS': { fr: '4ème année (BAC)', ar: 'البكالوريا' },
  };

  const totalSubjects = useMemo(
    () => programmeOfficiel.levels.reduce((sum, l) => sum + l.subjects.length, 0),
    []
  );

  const levelStats = useMemo(
    () => Object.fromEntries(programmeOfficiel.levels.map((l) => [l.key, getLevelStats(l)])),
    []
  );

  const toggleYear = (key: string) => {
    setOpenYears((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleSubject = (id: string) => {
    setOpenSubjects((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectSection = (levelKey: string, sectionKey: string) => {
    setActiveSection((prev) => ({ ...prev, [levelKey]: sectionKey }));
  };

  const switchTab = (tab: Tab) => {
    setActiveTab(tab);
    // Open first year of new tab
    if (tab === 'college') {
      if (!openYears.has('7eme')) {
        setOpenYears((prev) => new Set(prev).add('7eme'));
      }
    } else if (tab === 'lycee') {
      if (!openYears.has('1AS')) {
        setOpenYears((prev) => new Set(prev).add('1AS'));
      }
    }
  };

  // Filter levels per tab
  const collegeLevels = ['7eme', '8eme', '9eme'] as const;
  const lyceeLevels = ['1AS', '2AS', '3AS', '4AS'] as const;
  const visibleLevels: readonly string[] =
    activeTab === 'college' ? collegeLevels :
    activeTab === 'lycee' ? lyceeLevels :
    [];

  const getLangBadge = (lang: string) => {
    const map: Record<string, { bg: string; text: string; label: string }> = {
      fr: { bg: 'bg-blue-100', text: 'text-blue-700', label: '🇫🇷 FR' },
      ar: { bg: 'bg-amber-100', text: 'text-amber-700', label: '🇹🇳 AR' },
      en: { bg: 'bg-emerald-100', text: 'text-emerald-700', label: '🇬🇧 EN' },
    };
    return map[lang] || { bg: 'bg-slate-100', text: 'text-slate-700', label: lang.toUpperCase() };
  };

  return (
    <div className="bg-slate-50 min-h-screen" dir={isAr ? 'rtl' : 'ltr'}>
      {/* ============================================
          HERO
          ============================================ */}
      <section className="bg-gradient-to-br from-violet-600 via-purple-700 to-amber-500 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 lg:py-24 relative">
          <nav aria-label="Fil d'Ariane" className="flex items-center gap-1 text-xs text-violet-100 mb-6">
            <Link href="/" className="hover:text-white transition">
              {t('common.home')}
            </Link>
            <ChevronDown className="w-3 h-3 text-violet-300 rotate-[-90deg]" />
            <span className="text-white font-semibold">{t('title')}</span>
          </nav>

          <div className="flex items-start gap-4 mb-6">
            <div className="w-16 h-16 rounded-2xl bg-white/15 backdrop-blur-sm flex items-center justify-center flex-shrink-0 border border-white/20 shadow-lg">
              <Library className="w-8 h-8 text-white" />
            </div>
            <div>
              <h1 className="text-4xl lg:text-6xl font-extrabold tracking-tight leading-tight">
                {t('hero.title')}
              </h1>
              <p className="text-violet-100 mt-3 text-base lg:text-lg">
                {t('hero.subtitle')}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 mt-6">
            <span className="inline-flex items-center gap-1.5 bg-white/20 backdrop-blur-sm text-white px-4 py-1.5 rounded-full text-sm font-bold border border-white/20">
              <span className="text-emerald-300">✓</span> {t('badge.official')}
            </span>
            <span className="inline-flex items-center gap-1.5 bg-white/20 backdrop-blur-sm text-white px-4 py-1.5 rounded-full text-sm font-bold border border-white/20">
              📚 7 {t('badge.levels')}
            </span>
            <span className="inline-flex items-center gap-1.5 bg-white/20 backdrop-blur-sm text-white px-4 py-1.5 rounded-full text-sm font-bold border border-white/20">
              🎓 {totalSubjects} {t('badge.subjects')}
            </span>
            <span className="inline-flex items-center gap-1.5 bg-white/20 backdrop-blur-sm text-white px-4 py-1.5 rounded-full text-sm font-bold border border-white/20">
              🌍 FR · AR · EN
            </span>
          </div>
        </div>
      </section>

      {/* ============================================
          TOP TABS (Collège / Lycée / Sources) — sticky
          ============================================ */}
      <div className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-4">
          <nav className="flex items-center gap-1 overflow-x-auto py-2" aria-label="Onglets principaux">
            <button
              onClick={() => switchTab('college')}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold transition whitespace-nowrap ${
                activeTab === 'college'
                  ? 'bg-gradient-to-r from-violet-600 to-purple-700 text-white shadow-md'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <GraduationCap className="w-4 h-4" />
              {t('tabs.college')}
            </button>
            <button
              onClick={() => switchTab('lycee')}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold transition whitespace-nowrap ${
                activeTab === 'lycee'
                  ? 'bg-gradient-to-r from-violet-600 to-purple-700 text-white shadow-md'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Sparkles className="w-4 h-4" />
              {t('tabs.lycee')}
            </button>
            <button
              onClick={() => switchTab('sources')}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold transition whitespace-nowrap ${
                activeTab === 'sources'
                  ? 'bg-gradient-to-r from-violet-600 to-purple-700 text-white shadow-md'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <LinkIcon className="w-4 h-4" />
              {t('tabs.sources')}
            </button>
          </nav>
          <div className="hidden md:flex items-center gap-2 text-xs text-slate-500 py-2">
            <Layers className="w-3.5 h-3.5" />
            <span>{activeTab === 'college' ? '3 niveaux' : activeTab === 'lycee' ? '4 niveaux' : '6 sources'}</span>
          </div>
        </div>
      </div>

      {/* ============================================
          CONTENT
          ============================================ */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Year accordions (Collège + Lycée) */}
        {activeTab !== 'sources' && programmeOfficiel.levels
          .filter((l) => visibleLevels.includes(l.key))
          .map((level) => {
            const isOpen = openYears.has(level.key);
            const stats = levelStats[level.key];
            const currentSection = activeSection[level.key] || 'all';
            const isCollapsible = !!level.sections && level.sections.length > 0;

            return (
              <section
                key={level.key}
                id={`year-${level.key}`}
                className={`mb-5 bg-white rounded-2xl border-2 transition-all ${
                  isOpen ? 'border-violet-300 shadow-md' : 'border-slate-200'
                }`}
              >
                {/* Year header */}
                <button
                  onClick={() => toggleYear(level.key)}
                  className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left hover:bg-slate-50 rounded-2xl transition"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-700 flex items-center justify-center text-white font-extrabold flex-shrink-0">
                      {level.num}
                    </div>
                    <div className="min-w-0">
                      <div className="text-lg font-extrabold text-slate-900 truncate">
                        {isAr ? yearMap[level.key]?.ar : yearMap[level.key]?.fr || level.title}
                      </div>
                      <div className="text-xs text-slate-500 truncate">
                        {isAr ? level.subtitle : level.subtitle}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="hidden sm:inline-block text-xs font-bold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full">
                      {stats.totalSubjects} {t('badge.subjects').toLowerCase()}
                    </span>
                    <ChevronDown
                      className={`w-5 h-5 text-slate-400 transition-transform ${
                        isOpen ? 'rotate-180' : ''
                      }`}
                    />
                  </div>
                </button>

                {/* Section tabs (for years with sections like 2AS, 3AS, 4AS) */}
                {isOpen && isCollapsible && level.sections && (
                  <div className="px-5 pb-3 flex flex-wrap gap-1.5">
                    <button
                      onClick={() => selectSection(level.key, 'all')}
                      className={`px-3 py-1.5 rounded-full text-xs font-bold transition ${
                        currentSection === 'all'
                          ? 'bg-gradient-to-r from-violet-600 to-purple-700 text-white shadow-md'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      ✨ {t('sectionTabs.all')}
                    </button>
                    {level.sections.map((sec) => (
                      <button
                        key={sec.key}
                        onClick={() => selectSection(level.key, sec.key)}
                        className={`px-3 py-1.5 rounded-full text-xs font-bold transition ${
                          currentSection === sec.key
                            ? 'bg-gradient-to-r from-violet-600 to-purple-700 text-white shadow-md'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        {isAr ? sec.nameAr : sec.nameFr}
                      </button>
                    ))}
                  </div>
                )}

                {/* Subjects grid */}
                {isOpen && (
                  <div className="px-5 pb-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                    {level.subjects
                      .filter((subject) => {
                        if (currentSection === 'all') return true;
                        return subject.taughtIn.includes(currentSection);
                      })
                      .map((subject) => {
                        const Icon = SUBJECT_ICONS[subject.slug] || BookOpen;
                        const colorKey = subjectColor(subject.slug);
                        const colorSet = COLOR_MAP[colorKey] || COLOR_MAP.slate;
                        const isOpenCard = openSubjects.has(`${level.key}-${subject.slug}`);
                        const cardId = `${level.key}-${subject.slug}`;
                        const badge = getLangBadge(subject.lang);

                        return (
                          <div
                            key={subject.slug}
                            className={`subject-card rounded-xl border-2 ${colorSet.border} ${colorSet.bg} overflow-hidden`}
                            dir={isAr ? 'rtl' : 'ltr'}
                          >
                            {/* Card header */}
                            <button
                              onClick={() => toggleSubject(cardId)}
                              className={`w-full flex items-center gap-3 p-3.5 ${isAr ? 'flex-row-reverse text-right' : 'text-left'} hover:bg-white/50 transition`}
                            >
                              <div className={`w-9 h-9 rounded-lg ${colorSet.bg} ${colorSet.text} flex items-center justify-center flex-shrink-0`}>
                                <Icon className="w-4 h-4" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className={`text-sm font-extrabold ${colorSet.text} truncate`}>
                                  {isAr ? subject.nameAr : subject.name}
                                </div>
                                {isAr && subject.name !== subject.nameAr && (
                                  <div className="text-[10px] text-slate-500 truncate">
                                    {subject.name}
                                  </div>
                                )}
                              </div>
                              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${badge.bg} ${badge.text} flex-shrink-0`}>
                                {badge.label}
                              </span>
                              <ChevronDown className={`w-4 h-4 ${colorSet.text} transition-transform flex-shrink-0 ${isOpenCard ? 'rotate-180' : ''}`} />
                            </button>

                            {/* Card body */}
                            {isOpenCard && (
                              <div className="bg-white border-t border-slate-100 p-4 text-sm text-slate-700 max-h-96 overflow-y-auto">
                                {renderSubjectContent(subject, level.key, isAr)}
                              </div>
                            )}
                          </div>
                        );
                      })}
                  </div>
                )}
              </section>
            );
          })}

        {/* Sources tab content */}
        {activeTab === 'sources' && <SourcesSection />}
      </div>
    </div>
  );
}

function subjectColor(slug: string): string {
  const map: Record<string, string> = {
    mathematiques: 'blue',
    physique: 'indigo',
    svt: 'emerald',
    technologie: 'purple',
    informatique: 'cyan',
    anglais: 'cyan',
    francais: 'slate',
    arabe: 'red',
    philosophie: 'fuchsia',
    'histoire-geographie': 'yellow',
    'education-islamique': 'green',
    economie: 'orange',
    gestion: 'amber',
  };
  return map[slug] || 'slate';
}

function renderSubjectContent(subject: Subject, levelKey: string, isAr: boolean) {
  const data: any = subject.data;
  const useAR = subject.lang === 'ar';

  if (data.t1 || data.t2 || data.t3) {
    return (
      <div className="space-y-3">
        {data.t1 && <TrimestreBlock label="1" lessons={data.t1} useAR={useAR} isAr={isAr} />}
        {data.t2 && <TrimestreBlock label="2" lessons={data.t2} useAR={useAR} isAr={isAr} />}
        {data.t3 && <TrimestreBlock label="3" lessons={data.t3} useAR={useAR} isAr={isAr} />}
      </div>
    );
  }

  if (data.themes) {
    return (
      <div className="space-y-3">
        {data.themes.map((t: any, i: number) => (
          <div
            key={i}
            className={`border-l-2 border-violet-300 pl-3 ${useAR ? 'font-arabic text-right' : 'text-left'}`}
            dir={useAR ? 'rtl' : 'ltr'}
            style={useAR ? { fontFamily: 'var(--font-noto-arabic), "Noto Sans Arabic", sans-serif' } : undefined}
          >
            <div className="font-bold text-slate-900">{t.theme}</div>
            {t.duree && <div className="text-xs text-slate-500">⏱ {t.duree}</div>}
            {t.content && <div className="text-sm text-slate-700 mt-1 leading-relaxed">{t.content}</div>}
          </div>
        ))}
      </div>
    );
  }

  if (data.sections) {
    return (
      <div className="space-y-3">
        {Object.entries(data.sections).map(([secKey, sec]: [string, any]) => (
          <div key={secKey}>
            {sec.themes ? (
              sec.themes.map((t: any, i: number) => (
                <div
                  key={i}
                  className={`border-l-2 border-violet-300 pl-3 mb-3 ${useAR ? 'font-arabic text-right' : 'text-left'}`}
                  dir={useAR ? 'rtl' : 'ltr'}
                  style={useAR ? { fontFamily: 'var(--font-noto-arabic), "Noto Sans Arabic", sans-serif' } : undefined}
                >
                  <div className="font-bold text-slate-900">{t.theme}</div>
                  {t.duree && <div className="text-xs text-slate-500">⏱ {t.duree}</div>}
                  {t.content && <div className="text-sm text-slate-700 mt-1">{t.content}</div>}
                </div>
              ))
            ) : (
              <div>
                <div className="text-xs font-bold text-slate-500 uppercase mb-1">
                  {sec.nameFr || secKey}
                </div>
                {sec.trimestre1 && <TrimestreBlock label="1" lessons={sec.trimestre1} useAR={useAR} isAr={isAr} />}
                {sec.trimestre2 && <TrimestreBlock label="2" lessons={sec.trimestre2} useAR={useAR} isAr={isAr} />}
                {sec.trimestre3 && <TrimestreBlock label="3" lessons={sec.trimestre3} useAR={useAR} isAr={isAr} />}
              </div>
            )}
          </div>
        ))}
      </div>
    );
  }

  if (data.trimestre1 || data.trimestre2 || data.trimestre3) {
    return (
      <div className="space-y-3">
        {data.trimestre1 && <TrimestreBlock label="1" lessons={data.trimestre1} useAR={useAR} isAr={isAr} />}
        {data.trimestre2 && <TrimestreBlock label="2" lessons={data.trimestre2} useAR={useAR} isAr={isAr} />}
        {data.trimestre3 && <TrimestreBlock label="3" lessons={data.trimestre3} useAR={useAR} isAr={isAr} />}
      </div>
    );
  }

  return <div className="text-slate-500 italic">—</div>;
}

function TrimestreBlock({ label, lessons, useAR, isAr }: { label: string; lessons: string[]; useAR: boolean; isAr: boolean }) {
  const labels = useAR 
    ? ['الثلاثي الأول', 'الثلاثي الثاني', 'الثلاثي الثالث']
    : ['Trimestre 1', 'Trimestre 2', 'Trimestre 3'];
  return (
    <div>
      <div
        className={`trimestre-label text-xs font-bold text-violet-700 mb-1.5 ${useAR ? 'font-arabic text-right' : 'text-left'}`}
        dir={useAR ? 'rtl' : 'ltr'}
        style={useAR ? { fontFamily: 'var(--font-noto-arabic), "Noto Sans Arabic", sans-serif' } : undefined}
      >
        📌 {labels[parseInt(label) - 1]}
      </div>
      <ul
        className={`themes space-y-1 text-sm text-slate-700 ${useAR ? 'font-arabic text-right' : 'text-left'}`}
        dir={useAR ? 'rtl' : 'ltr'}
        style={useAR ? { fontFamily: 'var(--font-noto-arabic), "Noto Sans Arabic", sans-serif' } : undefined}
      >
        {lessons.map((lesson, i) => (
          <li key={i} className="flex items-start gap-2 leading-relaxed">
            <span className="text-violet-500 mt-1 flex-shrink-0">{useAR ? '◂' : '▸'}</span>
            <span>{lesson}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SourcesSection() {
  const t = useTranslations('programmeOfficiel');
  const sources = [
    { url: 'http://www.edunet.tn', nameFr: 'Portail Edunet', nameAr: 'بوابة إيدونت', desc: 'Ministère de l\'Éducation', icon: '🏛️' },
    { url: 'https://education.gov.tn', nameFr: 'Ministère de l\'Éducation Tunisien', nameAr: 'وزارة التربية التونسية', desc: 'Site officiel du Ministère', icon: '🏛️' },
    { url: 'https://www.cnp.com.tn', nameFr: 'CNP — Centre National Pédagogique', nameAr: 'المركز الوطني البيداغوجي', desc: 'Manuels scolaires', icon: '📚' },
    { url: 'https://www.bac.com.tn', nameFr: 'Bac.com.tn — Programmes BAC', nameAr: 'Bac.com.tn — برامج الباكالوريا', desc: 'Sujets et corrigés BAC', icon: '🎓' },
    { url: 'http://www.edunet.tn/ressources/pedagogie/programmes/2024_2025/aide_info_ScInfo.pdf', nameFr: 'Aide pédagogique — Informatique Sc Info (4AS)', nameAr: 'دليل بيداغوجي — الإعلامية (الرابعة)', desc: 'Document PDF officiel', icon: '📄' },
    { url: 'http://www.edunet.tn/ressources/pedagogie/programmes/2024_2025/Convention_Algorithmique_2024.pdf', nameFr: 'Convention Algorithmique 2024', nameAr: 'اتفاقية الخوارزميات 2024', desc: 'Document PDF officiel', icon: '📄' },
  ];
  return (
    <section className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
      <h2 className="text-2xl font-extrabold text-slate-900 mb-1 flex items-center gap-2">
        🔗 <span>{t('sources.title')}</span>
      </h2>
      <p className="text-sm text-slate-600 mb-5">{t('sources.subtitle')}</p>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {sources.map((s, i) => (
          <a
            key={i}
            href={s.url}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex items-start gap-3 p-4 rounded-xl bg-slate-50 hover:bg-violet-50 hover:border-violet-200 border border-transparent transition"
          >
            <span className="text-2xl flex-shrink-0">{s.icon}</span>
            <div className="flex-1 min-w-0">
              <div className="font-bold text-slate-900 group-hover:text-violet-700 text-sm">{s.nameFr}</div>
              <div className="text-xs text-slate-500 mt-0.5">{s.desc}</div>
            </div>
            <ExternalLink className="w-4 h-4 text-slate-400 group-hover:text-violet-500 flex-shrink-0 mt-0.5" />
          </a>
        ))}
      </div>
    </section>
  );
}
