import type { Metadata } from 'next';
import { Link } from '@/i18n/navigation';
import {
  GraduationCap,
  Target,
  Heart,
  Users,
  BookOpen,
  Globe,
  Sparkles,
  Award,
  ArrowRight,
  Mail,
} from 'lucide-react';
import { getTranslations, getLocale, getMessages } from 'next-intl/server';
import { breadcrumbSchema, SITE_URL } from '@/lib/structured-data';

export const revalidate = 3600; // 1 hour cache

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const isAr = locale === 'ar';
  return {
    title: isAr
      ? 'حول إكسامانت — مهمتنا وفريقنا وقيمنا'
      : 'À propos — Notre mission, équipe et valeurs',
    description: isAr
      ? 'اكتشف إكسامانت، المنصة التربوية #1 في تونس. مهمتنا: جعل التعليم مجانياً ومتاحاً لجميع التلاميذ التونسيين.'
      : "Découvrez Examanet, la plateforme pédagogique #1 en Tunisie. Notre mission : rendre l'éducation gratuite et accessible à tous les élèves tunisiens.",
    alternates: isAr ? { canonical: '/ar/a-propos' } : { canonical: '/fr/a-propos' },
    openGraph: {
      title: isAr ? 'حول إكسامانت' : "À propos d'Examanet",
      description: isAr
        ? 'مهمتنا، فريقنا وقيمنا من أجل التعليم في تونس.'
        : "Notre mission, notre équipe et nos valeurs pour l'éducation en Tunisie.",
      url: isAr ? '/a-propos' : '/a-propos',
      type: isAr ? 'website' : 'website',
      locale: isAr ? 'ar_TN' : 'fr_TN',
    },
  };
}

const breadcrumbJsonLd = breadcrumbSchema([
  { name: 'Accueil', url: SITE_URL },
  { name: 'À propos', url: `${SITE_URL}/a-propos` },
]);

// SECURITY: founder name is intentionally anonymized (initials only)
// to protect personal data. No personal email exposed on public pages.
// Contact: /contact page (generic, monitored)
const team = [{ name: 'B.Mehdi', roleKey: 'about.team.founder' as const }];

export default async function AboutPage() {
  const t = await getTranslations();
  const dict = await getTranslations();
  const messages = await getMessages();
  const isAr = dict === (require('@/messages/ar.json') as any);

  const milestones = [
    { year: '2024', title: t('about.milestones.m1.title'), desc: t('about.milestones.m1.desc') },
    { year: '2025', title: t('about.milestones.m2.title'), desc: t('about.milestones.m2.desc') },
    { year: '2026', title: t('about.milestones.m3.title'), desc: t('about.milestones.m3.desc') },
  ];

  const stats = [
    {
      value: t('about.stats.resources.value'),
      label: t('about.stats.resources.label'),
      icon: BookOpen,
      color: 'bg-primary-100 text-primary-600',
    },
    {
      value: t('about.stats.teachers.value'),
      label: t('about.stats.teachers.label'),
      icon: Users,
      color: 'bg-amber-100 text-amber-600',
    },
    {
      value: t('about.stats.students.value'),
      label: t('about.stats.students.label'),
      icon: GraduationCap,
      color: 'bg-emerald-100 text-emerald-600',
    },
    {
      value: t('about.stats.free.value'),
      label: t('about.stats.free.label'),
      icon: Award,
      color: 'bg-purple-100 text-purple-600',
    },
  ];

  const values = [
    { icon: Heart, titleKey: 'about.values.v1', descKey: 'about.values.v1' },
    { icon: Sparkles, titleKey: 'about.values.v2', descKey: 'about.values.v2' },
    { icon: Users, titleKey: 'about.values.v3', descKey: 'about.values.v3' },
    { icon: Globe, titleKey: 'about.values.v4', descKey: 'about.values.v4' },
    { icon: Target, titleKey: 'about.values.v5', descKey: 'about.values.v5' },
    { icon: Award, titleKey: 'about.values.v6', descKey: 'about.values.v6' },
  ];

  return (
    <div className="min-h-screen flex flex-col">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      <main className="flex-1 pt-16 lg:pt-20">
        {/* HERO */}
        <section className="relative bg-gradient-to-br from-primary-50 via-white to-sky-50 py-16 lg:py-24 overflow-hidden">
          <div className="absolute top-20 -left-20 w-96 h-96 bg-primary-200 rounded-full mix-blend-multiply filter blur-3xl opacity-30" />
          <div className="absolute top-40 -right-20 w-96 h-96 bg-amber-200 rounded-full mix-blend-multiply filter blur-3xl opacity-30" />

          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 relative">
            <div className="text-center mb-12">
              <div className="inline-flex items-center gap-2 bg-white border border-primary-200 rounded-full px-4 py-2 mb-6 shadow-sm">
                <Heart className="w-4 h-4 text-red-500 fill-red-500" />
                <span className="text-xs font-semibold text-slate-700">
                  {t('about.hero.badge')}
                </span>
              </div>
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold leading-tight mb-6">
                {t('about.hero.titleStart')}
                <span className="gradient-text">{t('about.hero.titleGradient')}</span>
                {t('about.hero.titleEnd')}
              </h1>
              <p className="text-lg lg:text-xl text-slate-600 max-w-3xl mx-auto">
                {t('about.hero.subtitle')}
              </p>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-12">
              {stats.map((s, i) => (
                <div
                  key={i}
                  className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 text-center"
                >
                  <div
                    className={`w-12 h-12 mx-auto mb-3 rounded-xl ${s.color} flex items-center justify-center`}
                  >
                    <s.icon className="w-6 h-6" />
                  </div>
                  <div className="text-2xl lg:text-3xl font-extrabold text-slate-900 mb-1">
                    {s.value}
                  </div>
                  <div className="text-sm text-slate-500">{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Notre histoire */}
        <section className="py-20 bg-white">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <div className="inline-block px-4 py-1.5 bg-primary-100 text-primary-700 rounded-full text-xs font-bold mb-3">
                {t('about.story.badge')}
              </div>
              <h2 className="text-3xl lg:text-5xl font-extrabold mb-3">{t('about.story.title')}</h2>
            </div>

            <div className="prose prose-lg max-w-3xl mx-auto text-slate-600 space-y-4">
              <p>
                <strong className="text-slate-900">{t('about.story.p1').split(',')[0]}</strong>
                {t('about.story.p1').substring(t('about.story.p1').indexOf(','))}
              </p>
              <p>
                <em className="text-slate-900">{t('about.story.p2')}</em>
              </p>
              <p>{t('about.story.p3')}</p>
            </div>
          </div>
        </section>

        {/* Nos valeurs */}
        <section className="py-20 bg-gradient-to-br from-slate-50 to-primary-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <div className="inline-block px-4 py-1.5 bg-primary-100 text-primary-700 rounded-full text-xs font-bold mb-3">
                {t('about.values.badge')}
              </div>
              <h2 className="text-3xl lg:text-5xl font-extrabold mb-3">
                {t('about.values.title')}
              </h2>
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {values.map((v, i) => (
                <div
                  key={i}
                  className="bg-white rounded-2xl p-6 border border-slate-100 card-hover"
                >
                  <div className="w-12 h-12 rounded-xl bg-primary-100 text-primary-600 flex items-center justify-center mb-4">
                    <v.icon className="w-6 h-6" />
                  </div>
                  <h3 className="text-lg font-bold mb-2">{t(v.titleKey + '.title')}</h3>
                  <p className="text-slate-600 text-sm">{t(v.descKey + '.desc')}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Timeline */}
        <section className="py-20 bg-white">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <div className="inline-block px-4 py-1.5 bg-primary-100 text-primary-700 rounded-full text-xs font-bold mb-3">
                {t('about.milestones.badge')}
              </div>
              <h2 className="text-3xl lg:text-5xl font-extrabold mb-3">
                {t('about.milestones.title')}
              </h2>
            </div>

            <div className="space-y-6">
              {milestones.map((m, i) => (
                <div key={i} className="flex gap-6 items-start">
                  <div className="flex-shrink-0 w-20 h-20 rounded-2xl bg-gradient-to-br from-primary-500 to-primary-700 text-white flex items-center justify-center font-extrabold text-lg shadow-lg shadow-primary-500/20">
                    {m.year}
                  </div>
                  <div className="flex-1 pt-2">
                    <h3 className="text-xl font-bold mb-1">{m.title}</h3>
                    <p className="text-slate-600">{m.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Équipe */}
        <section className="py-20 bg-gradient-to-br from-slate-50 to-primary-50">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <div className="inline-block px-4 py-1.5 bg-primary-100 text-primary-700 rounded-full text-xs font-bold mb-3">
                {t('about.team.badge')}
              </div>
              <h2 className="text-3xl lg:text-5xl font-extrabold mb-3">{t('about.team.title')}</h2>
              <p className="text-lg text-slate-600">{t('about.team.subtitle')}</p>
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {team.map((m, i) => (
                <div
                  key={i}
                  className="bg-white rounded-2xl p-6 text-center border border-slate-100"
                >
                  <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-gradient-to-br from-primary-500 to-primary-700 text-white font-extrabold text-2xl flex items-center justify-center shadow-lg shadow-primary-500/30">
                    {m.name
                      .split(/[.\s]+/)
                      .filter(Boolean)
                      .map((p) => p[0])
                      .join('')
                      .slice(0, 2)
                      .toUpperCase()}
                  </div>
                  <h3 className="font-bold text-lg mb-1">{m.name}</h3>
                  <div className="text-sm text-primary-600 font-semibold mb-2">{t(m.roleKey)}</div>
                  <Link
                    href="/contact"
                    className="text-xs text-slate-500 hover:text-primary-600 inline-flex items-center gap-1"
                  >
                    <Mail className="w-3 h-3" /> {t('about.team.contactCta')}
                  </Link>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-20 bg-white">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <h2 className="text-3xl lg:text-4xl font-extrabold mb-4">{t('about.cta.title')}</h2>
            <p className="text-lg text-slate-600 mb-8 whitespace-pre-line">
              {t('about.cta.subtitle')}
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              <Link
                href="/inscription"
                className="btn-primary inline-flex items-center gap-2 px-7 py-3.5"
              >
                {t('about.cta.cta1')}
                <ArrowRight className="w-4 h-4 rtl:rotate-180" />
              </Link>
              <Link
                href="/professeurs"
                className="btn-accent inline-flex items-center gap-2 px-7 py-3.5"
              >
                {t('about.cta.cta2')}
                <ArrowRight className="w-4 h-4 rtl:rotate-180" />
              </Link>
            </div>
          </div>
        </section>
      </main>

      </div>
  );
}
