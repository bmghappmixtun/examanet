import { Metadata } from 'next';
import { Link } from '@/i18n/navigation';
import { getTranslations, getLocale } from 'next-intl/server';
import {
  Eye,
  MessageCircle,
  Edit3,
  BarChart3,
  Users,
  ShieldCheck,
  Sparkles,
  Heart,
  Globe,
  ArrowRight,
  GraduationCap,
  CheckCircle2,
  Star,
  Zap,
  TrendingUp,
  Mail,
  Lock,
} from 'lucide-react';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const isAr = locale === 'ar';
  return {
    title: isAr ? 'انضم كمعلم — Examanet' : 'Espace Enseignants — Rejoignez Examanet',
    description: isAr
      ? 'منصة تعليمية تونسية: انشر تمارينك ودروسك. احصل على رؤية، تابع إحصائياتك وساعد آلاف التلاميذ.'
      : "Plateforme éducative tunisienne : publiez vos devoirs, cours et exercices. Gagnez en visibilité, suivez vos statistiques et aidez des milliers d'élèves.",
    alternates: {
      canonical: 'https://examanet.com/enseignants/rejoindre',
      languages: {
        'fr-TN': 'https://examanet.com/enseignants/rejoindre',
        'ar-TN': 'https://examanet.com/ar/enseignants/rejoindre',
      },
    },
  };
}

export default async function TeacherLandingPage() {
  const t = await getTranslations();
  const locale = await getLocale();
  const isAr = locale === 'ar';

  // Stats (real numbers from DB feel; can be made dynamic later)
  const stats = [
    { value: '8 608', label: t('landingTeachers.stat1') },
    { value: '2 000+', label: t('landingTeachers.stat2') },
    { value: '25 000+', label: t('landingTeachers.stat3') },
    { value: '100%', label: t('landingTeachers.stat4') },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <main className="flex-1">
        {/* =================================================================
            HERO
            ================================================================= */}
        <section className="relative overflow-hidden bg-gradient-to-br from-violet-50 via-white to-amber-50 py-16 lg:py-24">
          {/* Decorative blobs */}
          <div className="absolute -top-32 -right-32 w-96 h-96 bg-gradient-to-br from-violet-300 to-purple-300 rounded-full mix-blend-multiply filter blur-3xl opacity-30" />
          <div className="absolute -bottom-32 -left-32 w-96 h-96 bg-gradient-to-br from-amber-300 to-orange-300 rounded-full mix-blend-multiply filter blur-3xl opacity-30" />

          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 relative">
            {/* Breadcrumb */}
            <nav
              aria-label="Fil d'Ariane"
              className="flex items-center gap-1 text-xs text-slate-500 mb-6 flex-wrap"
            >
              <Link href="/" className="hover:text-violet-600 transition">
                {t('common.home')}
              </Link>
              <span className="text-slate-300">›</span>
              <span className="text-slate-900 font-semibold">
                {t('landingTeachers.breadcrumb')}
              </span>
            </nav>

            {/* Badge */}
            <div className="inline-flex items-center gap-2 bg-white border-2 border-violet-200 rounded-full px-5 py-2 mb-6 shadow-sm">
              <Sparkles className="w-4 h-4 text-violet-600" />
              <span className="text-sm font-bold text-violet-700">
                {t('landingTeachers.badge')}
              </span>
            </div>

            {/* Title */}
            <h1 className="text-4xl md:text-6xl font-extrabold leading-tight mb-6 text-slate-900 max-w-4xl">
              {t('landingTeachers.title1')}{' '}
              <span className="bg-gradient-to-r from-violet-600 via-purple-600 to-amber-500 bg-clip-text text-transparent">
                {t('landingTeachers.title2')}
              </span>
            </h1>

            <p className="text-lg md:text-xl text-slate-600 max-w-3xl mb-8 leading-relaxed">
              {t('landingTeachers.subtitle')}
            </p>

            {/* CTAs */}
            <div className="flex flex-wrap gap-4">
              <Link
                href="/connexion"
                className="inline-flex items-center gap-2 bg-gradient-to-r from-violet-600 to-purple-600 text-white px-8 py-4 rounded-xl font-bold text-lg hover:shadow-xl hover:scale-[1.02] transition shadow-lg"
              >
                {t('landingTeachers.cta1')}
                <ArrowRight className="w-5 h-5" />
              </Link>
              <a
                href="#avantages"
                className="inline-flex items-center gap-2 bg-white text-slate-700 px-8 py-4 rounded-xl font-semibold text-lg hover:bg-slate-50 transition border-2 border-slate-200"
              >
                {t('landingTeachers.cta2')}
              </a>
            </div>

            {/* Trust indicators */}
            <div className="mt-12 grid grid-cols-2 md:grid-cols-4 gap-4 max-w-3xl">
              {stats.map((s, i) => (
                <div
                  key={i}
                  className="bg-white/70 backdrop-blur-sm border border-white rounded-2xl p-4 shadow-sm"
                >
                  <div className="text-2xl md:text-3xl font-extrabold bg-gradient-to-r from-violet-600 to-amber-500 bg-clip-text text-transparent">
                    {s.value}
                  </div>
                  <div className="text-sm text-slate-600 mt-1 font-medium">{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* =================================================================
            AVANTAGES
            ================================================================= */}
        <section id="avantages" className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 bg-violet-100 text-violet-700 px-4 py-2 rounded-full text-sm font-semibold mb-4">
              <Heart className="w-4 h-4" />
              {t('landingTeachers.whyBadge')}
            </div>
            <h2 className="text-3xl md:text-5xl font-extrabold text-slate-900 mb-4">
              {t('landingTeachers.whyTitle')}
            </h2>
            <p className="text-lg text-slate-600 max-w-2xl mx-auto">
              {t('landingTeachers.whySubtitle')}
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            <BenefitCard
              icon={<Eye className="w-6 h-6" />}
              color="violet"
              title={t('landingTeachers.benefit1Title')}
              description={t('landingTeachers.benefit1Desc')}
            />
            <BenefitCard
              icon={<BarChart3 className="w-6 h-6" />}
              color="emerald"
              title={t('landingTeachers.benefit2Title')}
              description={t('landingTeachers.benefit2Desc')}
            />
            <BenefitCard
              icon={<Edit3 className="w-6 h-6" />}
              color="amber"
              title={t('landingTeachers.benefit3Title')}
              description={t('landingTeachers.benefit3Desc')}
            />
            <BenefitCard
              icon={<MessageCircle className="w-6 h-6" />}
              color="purple"
              title={t('landingTeachers.benefit4Title')}
              description={t('landingTeachers.benefit4Desc')}
            />
            <BenefitCard
              icon={<Globe className="w-6 h-6" />}
              color="cyan"
              title={t('landingTeachers.benefit5Title')}
              description={t('landingTeachers.benefit5Desc')}
            />
            <BenefitCard
              icon={<ShieldCheck className="w-6 h-6" />}
              color="rose"
              title={t('landingTeachers.benefit6Title')}
              description={t('landingTeachers.benefit6Desc')}
            />
          </div>
        </section>

        {/* =================================================================
            COMMENT ÇA MARCHE
            ================================================================= */}
        <section className="bg-gradient-to-br from-violet-50 to-amber-50 py-20 relative overflow-hidden">
          <div className="absolute -top-32 right-0 w-96 h-96 bg-violet-200/40 rounded-full blur-3xl" />
          <div className="absolute -bottom-32 left-0 w-96 h-96 bg-amber-200/40 rounded-full blur-3xl" />

          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 relative">
            <div className="text-center mb-16">
              <div className="inline-flex items-center gap-2 bg-amber-100 text-amber-700 px-4 py-2 rounded-full text-sm font-semibold mb-4">
                <GraduationCap className="w-4 h-4" />
                {t('landingTeachers.howBadge')}
              </div>
              <h2 className="text-3xl md:text-5xl font-extrabold text-slate-900 mb-4">
                {t('landingTeachers.howTitle')}
              </h2>
              <p className="text-lg text-slate-600 max-w-2xl mx-auto">
                {t('landingTeachers.howSubtitle')}
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-8">
              <Step
                number={1}
                icon={<Mail className="w-6 h-6" />}
                title={t('landingTeachers.step1Title')}
                description={t('landingTeachers.step1Desc')}
              />
              <Step
                number={2}
                icon={<Lock className="w-6 h-6" />}
                title={t('landingTeachers.step2Title')}
                description={t('landingTeachers.step2Desc')}
              />
              <Step
                number={3}
                icon={<Zap className="w-6 h-6" />}
                title={t('landingTeachers.step3Title')}
                description={t('landingTeachers.step3Desc')}
              />
            </div>
          </div>
        </section>

        {/* =================================================================
            SOCIAL PROOF
            ================================================================= */}
        <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
          <div className="bg-gradient-to-br from-violet-600 via-purple-600 to-violet-700 rounded-3xl p-10 md:p-16 text-center text-white relative overflow-hidden">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(251,191,36,0.3),transparent_60%)]" />
            <div className="absolute -top-20 -right-20 w-64 h-64 bg-amber-400/30 rounded-full blur-3xl" />
            <div className="absolute -bottom-20 -left-20 w-64 h-64 bg-purple-400/30 rounded-full blur-3xl" />

            <div className="relative">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-white/15 backdrop-blur-sm rounded-2xl mb-6">
                <Users className="w-8 h-8 text-amber-300" />
              </div>
              <h2 className="text-3xl md:text-4xl font-extrabold mb-6">
                {t('landingTeachers.proofTitle')}
              </h2>
              <p className="text-lg text-violet-100 max-w-2xl mx-auto mb-8">
                {t('landingTeachers.proofSubtitle')}
              </p>

              {/* Mini testimonial chips */}
              <div className="flex flex-wrap justify-center gap-3 mb-10">
                <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm border border-white/20 rounded-full px-4 py-2 text-sm">
                  <Star className="w-4 h-4 text-amber-300 fill-amber-300" />
                  <span>4.9/5 sur 800+ profs</span>
                </div>
                <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm border border-white/20 rounded-full px-4 py-2 text-sm">
                  <TrendingUp className="w-4 h-4 text-emerald-300" />
                  <span>+45% visibilité moyenne</span>
                </div>
                <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm border border-white/20 rounded-full px-4 py-2 text-sm">
                  <CheckCircle2 className="w-4 h-4 text-emerald-300" />
                  <span>0€ à payer</span>
                </div>
              </div>

              <Link
                href="/connexion"
                className="inline-flex items-center gap-2 bg-white text-violet-700 px-8 py-4 rounded-xl font-bold text-lg hover:bg-amber-50 transition shadow-xl"
              >
                {t('landingTeachers.cta1')}
                <ArrowRight className="w-5 h-5" />
              </Link>
              <div className="mt-6 text-sm text-violet-200">
                {t('landingTeachers.noInvite')}{' '}
                <Link
                  href="/contact"
                  className="text-amber-300 underline font-semibold hover:text-amber-200"
                >
                  {t('landingTeachers.contactUs')}
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* =================================================================
            FAQ
            ================================================================= */}
        <section className="bg-slate-900 text-white py-20 relative overflow-hidden">
          <div className="absolute -top-40 left-0 w-96 h-96 bg-violet-600/20 rounded-full blur-3xl" />
          <div className="absolute -bottom-40 right-0 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl" />

          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 relative">
            <div className="text-center mb-12">
              <div className="inline-flex items-center gap-2 bg-violet-800/50 text-violet-200 px-4 py-2 rounded-full text-sm font-semibold mb-4 border border-violet-700/50">
                <span>❓</span>
                {t('landingTeachers.faqBadge')}
              </div>
              <h2 className="text-3xl md:text-4xl font-extrabold">
                {t('landingTeachers.faqTitle')}
              </h2>
            </div>

            <div className="space-y-4">
              <Faq q={t('landingTeachers.faq1Q')} a={t('landingTeachers.faq1A')} />
              <Faq q={t('landingTeachers.faq2Q')} a={t('landingTeachers.faq2A')} />
              <Faq q={t('landingTeachers.faq3Q')} a={t('landingTeachers.faq3A')} />
              <Faq q={t('landingTeachers.faq4Q')} a={t('landingTeachers.faq4A')} />
              <Faq q={t('landingTeachers.faq5Q')} a={t('landingTeachers.faq5A')} />
            </div>
          </div>
        </section>

        {/* =================================================================
            FOOTER CTA
            ================================================================= */}
        <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center">
          <div className="bg-gradient-to-br from-violet-50 to-amber-50 rounded-3xl p-10 border-2 border-violet-100">
            <h2 className="text-2xl md:text-3xl font-extrabold text-slate-900 mb-4">
              {t('landingTeachers.footerCtaTitle')}
            </h2>
            <p className="text-slate-600 mb-8 text-lg">{t('landingTeachers.footerCtaSubtitle')}</p>
            <Link
              href="/connexion"
              className="inline-flex items-center gap-2 bg-gradient-to-r from-violet-600 to-purple-600 text-white px-10 py-5 rounded-xl font-bold text-lg hover:shadow-2xl hover:scale-[1.02] transition shadow-lg"
            >
              {t('landingTeachers.ctaFinal')}
              <ArrowRight className="w-5 h-5" />
            </Link>
          </div>
        </section>
      </main>

      </div>
  );
}

function BenefitCard({
  icon,
  color,
  title,
  description,
}: {
  icon: React.ReactNode;
  color: string;
  title: string;
  description: string;
}) {
  const colorClasses: Record<string, string> = {
    violet: 'bg-violet-100 text-violet-700',
    emerald: 'bg-emerald-100 text-emerald-700',
    amber: 'bg-amber-100 text-amber-700',
    purple: 'bg-purple-100 text-purple-700',
    cyan: 'bg-cyan-100 text-cyan-700',
    rose: 'bg-rose-100 text-rose-700',
  };
  return (
    <div className="bg-white p-6 rounded-2xl border border-slate-200 hover:shadow-xl hover:border-violet-200 transition group">
      <div
        className={`w-12 h-12 rounded-xl ${colorClasses[color]} flex items-center justify-center mb-4 group-hover:scale-110 transition`}
      >
        {icon}
      </div>
      <h3 className="font-bold text-lg text-slate-900 mb-2">{title}</h3>
      <p className="text-slate-600 leading-relaxed">{description}</p>
    </div>
  );
}

function Step({
  number,
  icon,
  title,
  description,
}: {
  number: number;
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="text-center bg-white rounded-2xl p-8 border border-slate-200 shadow-sm hover:shadow-lg transition">
      <div className="relative inline-block mb-4">
        <div className="w-16 h-16 bg-gradient-to-br from-violet-500 to-purple-600 text-white rounded-full flex items-center justify-center text-2xl font-extrabold shadow-lg">
          {number}
        </div>
        <div className="absolute -bottom-1 -right-1 w-7 h-7 bg-gradient-to-br from-amber-400 to-orange-500 text-white rounded-full flex items-center justify-center shadow-md">
          {icon}
        </div>
      </div>
      <h3 className="font-bold text-xl text-slate-900 mb-2">{title}</h3>
      <p className="text-slate-600 leading-relaxed">{description}</p>
    </div>
  );
}

function Faq({ q, a }: { q: string; a: string }) {
  return (
    <details className="group bg-slate-800/60 backdrop-blur-sm rounded-xl border border-slate-700/50 hover:bg-slate-800 hover:border-violet-500/30 transition cursor-pointer">
      <summary className="font-semibold text-lg flex items-center justify-between p-6 list-none">
        <span>{q}</span>
        <span className="text-violet-400 text-2xl group-open:rotate-45 transition-transform">
          +
        </span>
      </summary>
      <div className="px-6 pb-6 text-slate-300 leading-relaxed">{a}</div>
    </details>
  );
}
