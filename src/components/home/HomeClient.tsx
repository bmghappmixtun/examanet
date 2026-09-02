'use client';
import { Link } from '@/i18n/navigation';
import NextLink from 'next/link';
import {
  Search,
  BookOpen,
  Upload,
  Star,
  Download,
  Eye,
  Shield,
  Smartphone,
  Printer,
  Share2,
  ArrowRight,
  Sparkles,
  Users,
  FileText,
  TrendingUp,
  Award,
  Mail,
} from 'lucide-react';
import { useTranslations, useLocale } from 'next-intl';
import ResourceCard from '@/components/resources/ResourceCard';
import { formatNumber } from '@/lib/utils';

type Subject = {
  slug: string;
  nameFr: string;
  nameAr?: string;
  color?: string | null;
  icon?: string | null;
};
type Resource = any;

export default function HomeClient({
  popular,
  recent,
  subjects,
  stats,
}: {
  popular: Resource[];
  recent: Resource[];
  subjects: Subject[];
  stats: { resources: number; teachers: number; students: number; downloads: number };
}) {
  const t = useTranslations(); const locale = useLocale();
  const [resourceCount, teacherCount, studentCount, downloads] = [
    stats.resources,
    stats.teachers,
    stats.students,
    stats.downloads,
  ];

  const popularTags = ['Maths', 'Physique', 'SVT', 'Français', 'Arabe', 'Anglais'];

  // 2026-08-19 nightly fix (ERR-LKRCDG 3× + ERR-FGCMHE 1× React #419 on /fr):
  //
  // PREVIOUSLY this wrapper was <main>. The [locale]/layout.tsx ALSO wraps
  // children in <main className="min-h-screen">, so the rendered DOM had
  // TWO nested <main> elements (a real HTML5 accessibility violation —
  // only one visible <main> is allowed per document). The hydration walker
  // saw the nested <main> structure on both server and client and recovered
  // with React #419 ("There was an error while hydrating but React was
  // able to recover by instead client rendering the entire root") on rare
  // navigations from the not-found boundary to /fr.
  //
  // FIX: use a <div> here. The layout already provides the semantic
  // <main>, and the pt-16 lg:pt-20 classes (offset for the fixed Header)
  // stay on this wrapper so the visual layout is unchanged.
  return (
    <div className="flex-1 pt-16 lg:pt-20">
      {/* HERO */}
      <section className="relative bg-gradient-to-br from-primary-50 via-white to-sky-50 overflow-hidden">
        <div className="absolute top-20 -start-20 w-48 h-48 sm:w-72 sm:h-72 lg:w-96 lg:h-96 bg-primary-200 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-float" />
        <div
          className="absolute top-40 -end-20 w-48 h-48 sm:w-72 sm:h-72 lg:w-96 lg:h-96 bg-amber-200 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-float"
          style={{ animationDelay: '2s' }}
        />
        <div
          className="absolute -bottom-20 start-1/3 w-48 h-48 sm:w-72 sm:h-72 lg:w-96 lg:h-96 bg-sky-200 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-float"
          style={{ animationDelay: '4s' }}
        />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 lg:py-24 relative">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div className="animate-fade-in-up">
              <div className="inline-flex items-center gap-2 bg-white border border-primary-200 rounded-full px-4 py-2 mb-6 shadow-sm">
                <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                <span className="text-xs font-semibold text-slate-700">
                  +{formatNumber(resourceCount)} {t('home.sections.popularTitle').toLowerCase()}
                </span>
              </div>

              <h1 className="text-4xl sm:text-5xl lg:text-6xl xl:text-7xl font-extrabold leading-[1.05] mb-6">
                {t('home.heroTitle')}{' '}
                <span className="gradient-text">{t('home.heroHighlight')}</span>
              </h1>

              <p
                className="text-lg lg:text-xl text-slate-600 mb-8 max-w-xl"
                dangerouslySetInnerHTML={{
                  __html: t('home.heroSubtitle', {
                    strong: '<strong class="text-slate-900">',
                    strongEnd: '</strong>',
                  }),
                }}
              />

              <form
                action="/recherche"
                method="GET"
                className="bg-white rounded-2xl p-2 shadow-xl shadow-primary-500/10 flex flex-col sm:flex-row gap-2 mb-6 border border-slate-100"
              >
                <div className="flex-1 flex items-center gap-2 px-4 py-2">
                  <Search className="w-5 h-5 text-slate-400" />
                  <input
                    name="q"
                    type="text"
                    placeholder={t('home.searchPlaceholder')}
                    className="flex-1 bg-transparent outline-none text-slate-700 placeholder-slate-400 text-sm"
                  />
                </div>
                <button type="submit" className="btn-primary">
                  <Search className="w-4 h-4" /> {t('common.search')}
                </button>
              </form>

              <div className="flex flex-wrap gap-2 mb-8">
                {popularTags.map((s) => (
                  <Link
                    key={s}
                    href={`/matieres/${s.toLowerCase()}`}
                    className="px-4 py-2 bg-white border border-slate-200 rounded-full text-xs font-semibold text-slate-700 hover:border-primary-400 hover:text-primary-600 transition"
                  >
                    {s}
                  </Link>
                ))}
              </div>

              <div className="flex flex-wrap gap-3">
                <Link href="/ressources" className="btn-primary text-base px-7 py-3.5">
                  <BookOpen className="w-5 h-5" /> {t('home.exploreResources')}
                </Link>
                <NextLink href="/inscription" className="btn-accent text-base px-7 py-3.5">
                  <Upload className="w-5 h-5" /> {t('home.becomeTeacher')}
                </NextLink>
              </div>
            </div>

            <div className="relative hidden lg:block">
              <div className="relative w-full max-w-md mx-auto aspect-square">
                <div className="absolute inset-0 bg-gradient-to-br from-primary-500 to-primary-700 rounded-3xl shadow-2xl shadow-primary-500/40 rotate-3 hover:rotate-0 transition-transform duration-500 flex items-center justify-center">
                  <div className="text-center text-white p-8">
                    <div className="text-8xl mb-4">📚</div>
                    <div className="text-2xl font-extrabold">{t('home.sections.whyFreeTitle')}</div>
                    <div className="text-lg opacity-90">{t('home.sections.whyFreeDesc')}</div>
                  </div>
                </div>
                <div className="absolute -top-4 -end-4 bg-white rounded-2xl shadow-2xl p-4 animate-float">
                  <div className="flex items-center gap-2">
                    <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
                      <Download className="w-5 h-5 text-green-600" />
                    </div>
                    <div>
                      <div className="text-xs text-slate-500">{t('home.stats.downloads')}</div>
                      <div className="text-lg font-bold">{formatNumber(downloads)}</div>
                    </div>
                  </div>
                </div>
                <div
                  className="absolute -bottom-4 -start-4 bg-white rounded-2xl shadow-2xl p-4 animate-float"
                  style={{ animationDelay: '1s' }}
                >
                  <div className="flex items-center gap-2">
                    <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
                      <Star className="w-5 h-5 fill-amber-500 text-amber-500" />
                    </div>
                    <div>
                      <div className="text-xs text-slate-500">{t('teacher.avgRating')}</div>
                      <div className="text-lg font-bold">4.8/5</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Live stats */}
          <div className="mt-16 grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              {
                icon: FileText,
                value: resourceCount,
                label: t('home.stats.resources'),
                color: 'bg-primary-100',
                text: 'text-primary-600',
              },
              {
                icon: Users,
                value: teacherCount,
                label: t('home.stats.teachers'),
                color: 'bg-amber-100',
                text: 'text-amber-600',
              },
              {
                icon: Award,
                value: studentCount,
                label: t('home.stats.students'),
                color: 'bg-emerald-100',
                text: 'text-emerald-600',
              },
              {
                icon: TrendingUp,
                value: downloads,
                label: t('home.stats.downloads'),
                color: 'bg-purple-100',
                text: 'text-purple-600',
              },
            ].map((s, i) => (
              <div
                key={i}
                className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 text-center card-hover"
              >
                <div
                  className={`w-12 h-12 mx-auto mb-3 rounded-xl ${s.color} flex items-center justify-center`}
                >
                  <s.icon className={`w-6 h-6 ${s.text}`} />
                </div>
                <div className="text-3xl lg:text-4xl font-extrabold text-slate-900 mb-1">
                  {formatNumber(s.value)}+
                </div>
                <div className="text-sm text-slate-500">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* NIVEAUX */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <div className="inline-block px-4 py-1.5 bg-primary-100 text-primary-700 rounded-full text-xs font-bold mb-3">
              {t('nav.levels').toUpperCase()}
            </div>
            <h2 className="text-3xl lg:text-5xl font-extrabold mb-3">
              {t('home.sections.levelsTitle')}{' '}
              <span className="gradient-text">{t('home.sections.levelsHighlight')}</span>
            </h2>
            <p className="text-lg text-slate-600">{t('home.sections.levelsSubtitle')}</p>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                slug: 'college',
                name: t('levels.college'),
                desc: t('levels.collegeDesc'),
                icon: '📖',
                bg: 'from-emerald-50 to-green-50',
                border: 'border-emerald-200',
                href: '/niveaux/college',
              },
              {
                slug: 'lycee',
                name: t('levels.lycee'),
                desc: t('levels.lyceeDesc'),
                icon: '📚',
                bg: 'from-primary-50 to-sky-50',
                border: 'border-primary-200',
                href: '/niveaux/lycee',
              },
              {
                slug: 'bac',
                name: t('levels.bac'),
                desc: t('levels.bacDesc'),
                icon: '🎓',
                bg: 'from-amber-50 to-orange-50',
                border: 'border-amber-200',
                href: '/bac',
              },
            ].map((n) => (
              <Link
                key={n.slug}
                href={n.href}
                className={`group relative bg-gradient-to-br ${n.bg} rounded-3xl p-8 border-2 ${n.border} hover:border-primary-400 transition-all card-hover overflow-hidden`}
              >
                <div className="absolute -top-10 -end-10 w-40 h-40 bg-primary-200 rounded-full opacity-30 group-hover:scale-150 transition-transform duration-500" />
                <div className="relative z-10">
                  <div className="text-6xl mb-4">{n.icon}</div>
                  <h3 className="text-2xl font-extrabold text-slate-900 mb-2">{n.name}</h3>
                  <p className="text-slate-600 mb-4">{n.desc}</p>
                  <div className="flex items-center gap-2 text-sm text-primary-700 font-semibold">
                    {t('levels.exploreLevel')}{' '}
                    <ArrowRight className="w-4 h-4 group-hover:translate-x-2 transition-transform rtl:group-hover:-translate-x-2" />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* MATIÈRES */}
      <section className="py-20 bg-gradient-to-br from-slate-50 to-primary-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <div className="inline-block px-4 py-1.5 bg-primary-100 text-primary-700 rounded-full text-xs font-bold mb-3">
              {t('nav.subjects').toUpperCase()}
            </div>
            <h2 className="text-3xl lg:text-5xl font-extrabold mb-3">
              {t('home.sections.subjectsTitle')}{' '}
              <span className="gradient-text">{t('home.sections.subjectsHighlight')}</span>
            </h2>
            <p className="text-lg text-slate-600">{t('home.sections.subjectsSubtitle')}</p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-8 gap-3">
            {subjects.slice(0, 16).map((s) => (
              <Link
                key={s.slug}
                href={`/matieres/${s.slug}`}
                className="bg-white rounded-2xl p-4 text-center card-hover border border-slate-100 group"
              >
                <div
                  className="w-12 h-12 mx-auto mb-2 rounded-xl flex items-center justify-center"
                  style={{ background: (s.color || '#0EA5E9') + '20' }}
                >
                  <BookOpen className="w-6 h-6" style={{ color: s.color || '#0EA5E9' }} />
                </div>
                <div className="font-bold text-xs text-slate-900 line-clamp-2">
                  {locale === 'ar' && s.nameAr ? s.nameAr : s.nameFr}
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* POPULAIRES */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between mb-10">
            <div>
              <div className="inline-block px-4 py-1.5 bg-primary-100 text-primary-700 rounded-full text-xs font-bold mb-3">
                {t('home.sections.popularTitle').toUpperCase()}
              </div>
              <h2 className="text-3xl lg:text-5xl font-extrabold mb-2">
                {t('home.sections.popularTitle')}{' '}
                <span className="gradient-text">{t('home.sections.popularHighlight')}</span>
              </h2>
              <p className="text-lg text-slate-600">{t('home.sections.popularSubtitle')}</p>
            </div>
            <Link
              href="/ressources"
              className="mt-4 md:mt-0 inline-flex items-center gap-2 text-primary-600 font-semibold hover:gap-3 transition-all"
            >
              {t('common.seeMore')} <ArrowRight className="w-4 h-4 rtl:rotate-180" />
            </Link>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {popular.slice(0, 8).map((r) => (
              <ResourceCard key={r.id} resource={r} />
            ))}
          </div>
        </div>
      </section>

      {/* NOUVEAUTÉS */}
      <section className="py-20 bg-gradient-to-br from-primary-50 to-sky-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between mb-10">
            <div>
              <div className="inline-block px-4 py-1.5 bg-emerald-100 text-emerald-700 rounded-full text-xs font-bold mb-3">
                🆕 {t('common.newest').toUpperCase()}
              </div>
              <h2 className="text-3xl lg:text-5xl font-extrabold mb-2">
                {t('home.sections.recentTitle')}{' '}
                <span className="gradient-text">{t('home.sections.recentHighlight')}</span>
              </h2>
              <p className="text-lg text-slate-600">{t('home.sections.recentSubtitle')}</p>
            </div>
            <Link
              href="/ressources?sort=recent"
              className="mt-4 md:mt-0 inline-flex items-center gap-2 text-primary-600 font-semibold hover:gap-3 transition-all"
            >
              {t('common.seeMore')} <ArrowRight className="w-4 h-4 rtl:rotate-180" />
            </Link>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {recent.slice(0, 8).map((r) => (
              <ResourceCard key={r.id} resource={r} />
            ))}
          </div>
        </div>
      </section>

      {/* COMMENT ÇA MARCHE */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <div className="inline-block px-4 py-1.5 bg-primary-100 text-primary-700 rounded-full text-xs font-bold mb-3">
              {t('home.sections.howTitle').toUpperCase()}
            </div>
            <h2 className="text-3xl lg:text-5xl font-extrabold mb-3">
              {t('home.sections.howTitle')}{' '}
              <span className="gradient-text">{t('home.sections.howHighlight')}</span>
            </h2>
            <p className="text-lg text-slate-600">{t('home.sections.howSubtitle')}</p>
          </div>
          <div className="grid lg:grid-cols-2 gap-8">
            <div className="card p-8 border-slate-100">
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-primary-100 text-primary-700 rounded-full text-xs font-bold mb-4">
                {t('auth.student').toUpperCase()}
              </div>
              <h3 className="text-2xl font-extrabold mb-6">{t('home.sections.howTitle')}</h3>
              {[
                { title: t('home.sections.step1Title'), desc: t('home.sections.step1Desc') },
                { title: t('home.sections.step2Title'), desc: t('home.sections.step2Desc') },
                { title: t('home.sections.step3Title'), desc: t('home.sections.step3Desc') },
              ].map((s, i) => (
                <div key={i} className="flex gap-4 mb-4 last:mb-0">
                  <div className="w-10 h-10 flex-shrink-0 rounded-full bg-primary-100 text-primary-700 font-extrabold flex items-center justify-center">
                    {i + 1}
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-900">{s.title}</h4>
                    <p className="text-sm text-slate-600">{s.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="card p-8 border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50">
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-amber-100 text-amber-700 rounded-full text-xs font-bold mb-4">
                {t('auth.teacher').toUpperCase()}
              </div>
              <h3 className="text-2xl font-extrabold mb-6">{t('home.becomeTeacher')}</h3>
              {[
                { title: t('auth.signupButton'), desc: t('home.sections.step1Desc') },
                { title: t('teacher.fileUpload'), desc: t('teacher.pendingNotice') },
                { title: t('teacher.analytics'), desc: t('teacher.avgRating') },
              ].map((s, i) => (
                <div key={i} className="flex gap-4 mb-4 last:mb-0">
                  <div className="w-10 h-10 flex-shrink-0 rounded-full bg-amber-200 text-amber-700 font-extrabold flex items-center justify-center">
                    {i + 1}
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-900">{s.title}</h4>
                    <p className="text-sm text-slate-600">{s.desc}</p>
                  </div>
                </div>
              ))}
              <NextLink href="/inscription" className="btn-accent mt-4">
                {t('home.becomeTeacher')} <ArrowRight className="w-4 h-4 rtl:rotate-180" />
              </NextLink>
            </div>
          </div>
        </div>
      </section>

      {/* POURQUOI NOUS */}
      <section className="py-20 bg-gradient-to-br from-slate-50 to-primary-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <div className="inline-block px-4 py-1.5 bg-primary-100 text-primary-700 rounded-full text-xs font-bold mb-3">
              {t('home.sections.whyTitle').toUpperCase()}
            </div>
            <h2 className="text-3xl lg:text-5xl font-extrabold mb-3">
              {t('home.sections.whyTitle')}{' '}
              <span className="gradient-text">{t('home.sections.whyHighlight')}</span>
            </h2>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              {
                icon: Download,
                title: t('home.sections.whyFreeTitle'),
                desc: t('home.sections.whyFreeDesc'),
                color: 'bg-primary-100 text-primary-600',
              },
              {
                icon: Shield,
                title: t('home.sections.whyQualityTitle'),
                desc: t('home.sections.whyQualityDesc'),
                color: 'bg-amber-100 text-amber-600',
              },
              {
                icon: Eye,
                title: t('resource.preview'),
                desc: t('resource.readOnline'),
                color: 'bg-emerald-100 text-emerald-600',
              },
              {
                icon: Printer,
                title: t('common.print'),
                desc: t('resource.downloadStarted'),
                color: 'bg-purple-100 text-purple-600',
              },
              {
                icon: Share2,
                title: t('common.share'),
                desc: t('resource.copiedLink'),
                color: 'bg-pink-100 text-pink-600',
              },
              {
                icon: Smartphone,
                title: t('home.sections.whyMobileTitle'),
                desc: t('home.sections.whyMobileDesc'),
                color: 'bg-cyan-100 text-cyan-600',
              },
            ].map((f, i) => (
              <div key={i} className="bg-white rounded-2xl p-6 border border-slate-100 card-hover">
                <div
                  className={`w-14 h-14 rounded-2xl ${f.color} flex items-center justify-center mb-4`}
                >
                  <f.icon className="w-7 h-7" />
                </div>
                <h3 className="text-lg font-bold mb-2">{f.title}</h3>
                <p className="text-slate-600 text-sm">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA ENSEIGNANT */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="relative bg-gradient-to-br from-primary-600 via-primary-700 to-primary-900 rounded-3xl p-10 lg:p-16 overflow-hidden">
            <div className="absolute -top-20 -end-20 w-80 h-80 bg-primary-400 rounded-full opacity-20 blur-3xl" />
            <div className="absolute -bottom-20 -start-20 w-80 h-80 bg-amber-400 rounded-full opacity-20 blur-3xl" />
            <div className="relative z-10 grid lg:grid-cols-2 gap-8 items-center">
              <div>
                <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur border border-white/20 rounded-full px-4 py-2 mb-6">
                  <Sparkles className="w-4 h-4 text-amber-300" />
                  <span className="text-xs font-bold text-white">
                    {t('home.sections.ctaTeacherTitle').toUpperCase()}
                  </span>
                </div>
                <h2 className="text-3xl lg:text-5xl font-extrabold text-white mb-4 leading-tight">
                  {t('home.sections.ctaTeacherTitle')}{' '}
                  <span className="text-amber-300">
                    +{formatNumber(studentCount)} {t('home.stats.students').toLowerCase()}
                  </span>
                </h2>
                <p className="text-primary-100 text-lg mb-6">{t('home.sections.ctaTeacherDesc')}</p>
                <div className="flex flex-wrap gap-3">
                  <NextLink
                    href="/inscription"
                    className="bg-white text-primary-700 font-bold px-7 py-3.5 rounded-full shadow-xl hover:scale-105 transition-all inline-flex items-center gap-2"
                  >
                    <Upload className="w-5 h-5" /> {t('home.becomeTeacher')}
                  </NextLink>
                  <Link
                    href="/professeurs"
                    className="bg-white/10 backdrop-blur border border-white/30 text-white font-bold px-7 py-3.5 rounded-full hover:bg-white/20 transition inline-flex items-center gap-2"
                  >
                    {t('nav.teachers')} <ArrowRight className="w-4 h-4 rtl:rotate-180" />
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* NEWSLETTER */}
      <section className="py-20 bg-gradient-to-br from-slate-50 to-primary-50">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-primary-100 flex items-center justify-center">
            <Mail className="w-8 h-8 text-primary-600" />
          </div>
          <h2 className="text-3xl lg:text-5xl font-extrabold mb-4">
            {t('home.sections.newsletterTitle')}{' '}
            <span className="gradient-text">{t('home.sections.newsletterHighlight')}</span>
          </h2>
          <p className="text-lg text-slate-600 mb-8">{t('home.sections.newsletterSubtitle')}</p>
          <form
            action="/api/newsletter"
            method="POST"
            className="flex flex-col sm:flex-row gap-3 max-w-lg mx-auto"
          >
            <input
              type="email"
              name="email"
              placeholder={t('home.sections.newsletterPlaceholder')}
              required
              className="input flex-1"
            />
            <button type="submit" className="btn-primary px-7 py-3">
              {t('home.sections.newsletterCta')}
            </button>
          </form>
          <p className="text-xs text-slate-500 mt-3">
            🔒 {t('common.cancel')} {t('common.confirm')}
          </p>
        </div>
      </section>
    </div>
  );
}
