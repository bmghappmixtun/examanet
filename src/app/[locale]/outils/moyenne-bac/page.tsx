import type { Metadata } from 'next';
import { Link } from '@/i18n/navigation';
import { getTranslations, getLocale } from 'next-intl/server';
import { Calculator, ArrowLeft, Award } from 'lucide-react';
import { SITE_URL } from '@/lib/structured-data';

export const revalidate = 3600;

const PAGE_PATH = '/outils/moyenne-bac';
const PAGE_URL_FR = `${SITE_URL}/fr${PAGE_PATH}`;
const PAGE_URL_AR = `${SITE_URL}/ar${PAGE_PATH}`;

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const isAr = locale === 'ar';
  return {
    title: isAr
      ? 'حساب معدل الباكالوريا التونسية 2025 — معاملات رسمية'
      : 'Calcul Moyenne Bac Tunisie 2025 — Coefficients officiels',
    description: isAr
      ? 'احسب معدلك في الباكالوريا التونسية حسب شعبتك مع المعاملات الرسمية لوزارة التربية (الدورة الرئيسية والمراقبة).'
      : "Calculez votre moyenne du Bac tunisien selon votre section, avec les coefficients officiels du Ministère de l'Éducation (sessions principale et de contrôle).",
    alternates: { canonical: isAr ? PAGE_URL_AR : PAGE_URL_FR },
    openGraph: {
      title: isAr ? 'حساب معدل الباكالوريا' : 'Calcul Moyenne Bac',
      description: isAr
        ? 'احسب معدلك في الباكالوريا التونسية'
        : 'Calculez votre moyenne du Bac tunisien',
      url: isAr ? PAGE_URL_AR : PAGE_URL_FR,
      locale: isAr ? 'ar_TN' : 'fr_TN',
      type: 'website',
    },
  };
}

export default async function MoyenneBacPage() {
  const t = await getTranslations();
  const locale = await getLocale();
  const isAr = locale === 'ar';

  return (
    <div className="min-h-screen flex flex-col">
      <main className="flex-1 pt-20">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <Link
            href="/bac"
            className="inline-flex items-center gap-2 text-sm text-primary-600 hover:text-primary-700 mb-6"
          >
            <ArrowLeft className="w-4 h-4 rtl:rotate-180" />
            {isAr ? 'العودة إلى الباكالوريا' : 'Retour au Bac'}
          </Link>

          <div className="bg-gradient-to-br from-violet-50 to-amber-50 rounded-3xl p-8 border-2 border-violet-200">
            <div className="inline-flex items-center gap-2 bg-white border-2 border-violet-200 rounded-full px-4 py-2 mb-4 shadow-sm">
              <Calculator className="w-5 h-5 text-violet-600" />
              <span className="text-sm font-bold text-violet-700">
                {isAr ? '🧮 حاسبة الباكالوريا' : '🧮 Calculateur Bac'}
              </span>
            </div>
            <h1 className="text-3xl lg:text-4xl font-extrabold mb-3 text-slate-900">
              {isAr ? 'احسب معدلك في الباكالوريا' : 'Calculer ma moyenne du Bac'}
            </h1>
            <p className="text-slate-600 mb-6">
              {isAr
                ? 'هذه الأداة ستحسب معدلك تلقائياً حسب شعبتك ومعاملات وزارة التربية الرسمية 2025-2026.'
                : "Cet outil calcule automatiquement votre moyenne selon votre section, avec les coefficients officiels 2025-2026 du Ministère de l'Éducation."}
            </p>
            <div className="bg-white/60 backdrop-blur-sm rounded-2xl p-6 border-2 border-violet-100 text-center">
              <div className="text-6xl mb-3">🚧</div>
              <h3 className="text-xl font-bold text-slate-900 mb-2">
                {isAr ? 'قريباً جداً' : 'Bientôt disponible'}
              </h3>
              <p className="text-sm text-slate-600 mb-4">
                {isAr
                  ? 'نعمل على إطلاق حاسبة الباكالوريا مع جميع الشعب السبعة (الرياضيات، العلوم التجريبية، العلوم التقنية، علوم الإعلامية، الاقتصاد والتصرف، الآداب، الرياضة).'
                  : 'La calculatrice Bac arrive très bientôt avec les 7 sections (Math, Sciences Exp, Sciences Tech, Sc Info, Éco-Gestion, Lettres, Sport).'}
              </p>
              <div className="flex flex-wrap items-center justify-center gap-2 text-xs text-slate-500">
                <Award className="w-4 h-4" />
                <span>{isAr ? 'معاملات رسمية 2025-2026' : 'Coefficients officiels 2025-2026'}</span>
              </div>
            </div>
          </div>
        </div>
      </main>
      </div>
  );
}
