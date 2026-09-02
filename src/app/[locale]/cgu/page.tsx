import type { Metadata } from 'next';
import { Scale, CheckCircle } from 'lucide-react';
import { getTranslations, getLocale, getMessages } from 'next-intl/server';
import { breadcrumbSchema, SITE_URL } from '@/lib/structured-data';

export const revalidate = 3600; // 1 hour cache

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const isAr = locale === 'ar';
  return {
    title: isAr ? 'شروط الاستخدام — إكسامانت' : "CGU — Conditions Générales d'Utilisation",
    description: isAr
      ? 'شروط استخدام منصة إكسامانت. الحقوق والالتزامات والمسؤوليات.'
      : "Conditions générales d'utilisation de la plateforme Examanet. Droits, obligations et responsabilités des utilisateurs.",
    alternates: isAr ? { canonical: '/ar/cgu' } : { canonical: '/fr/cgu' },
  };
}

const breadcrumbJsonLd = breadcrumbSchema([
  { name: 'Accueil', url: SITE_URL },
  { name: 'CGU', url: `${SITE_URL}/cgu` },
]);

export default async function CGUPage() {
  const t = await getTranslations();
  const dict = await getTranslations();
  const messages = await getMessages();
  const sections =
    (messages.cgu?.sections as Array<{ id: string; title: string; content: string }>) || [];

  return (
    <div className="min-h-screen flex flex-col">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      <main className="flex-1 pt-16 lg:pt-20">
        {/* HERO */}
        <section className="bg-gradient-to-br from-primary-50 via-white to-sky-50 py-12 lg:py-16">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center gap-2 mb-4">
              <Scale className="w-5 h-5 text-primary-600" />
              <span className="text-sm font-bold text-primary-600">{t('cgu.badge')}</span>
            </div>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold mb-4">
              {t('cgu.hero.title')}
            </h1>
            <p className="text-lg text-slate-600 mb-2">
              {t('cgu.hero.lastUpdate')}
              <strong>{t('cgu.hero.lastUpdateDate')}</strong>
            </p>
            <p className="text-slate-500">{t('cgu.hero.intro')}</p>
          </div>
        </section>

        {/* Sommaire */}
        <section className="py-8 bg-slate-50 border-b border-slate-200">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-3">
              {t('cgu.sommaire')}
            </h2>
            <div className="grid sm:grid-cols-2 gap-x-6 gap-y-1 text-sm">
              {sections.map((s) => (
                <a
                  key={s.id}
                  href={`#${s.id}`}
                  className="text-primary-600 hover:text-primary-700 hover:underline py-1"
                >
                  → {s.title}
                </a>
              ))}
            </div>
          </div>
        </section>

        {/* Contenu */}
        <article className="py-16 bg-white">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            {sections.map((s) => (
              <section key={s.id} id={s.id} className="mb-12 scroll-mt-20">
                <h2 className="text-2xl font-extrabold text-slate-900 mb-4 flex items-center gap-3">
                  <span className="w-8 h-8 rounded-lg bg-primary-100 text-primary-600 flex items-center justify-center text-sm font-bold flex-shrink-0">
                    {s.id.length}
                  </span>
                  {s.title}
                </h2>
                <div className="prose prose-slate max-w-none text-slate-600 leading-relaxed whitespace-pre-line">
                  {s.content}
                </div>
              </section>
            ))}

            {/* Acceptation */}
            <div className="mt-12 p-6 bg-gradient-to-br from-primary-50 to-sky-50 border border-primary-200 rounded-2xl">
              <div className="flex items-start gap-3">
                <CheckCircle className="w-6 h-6 text-primary-600 flex-shrink-0 mt-1" />
                <div>
                  <h3 className="font-bold text-slate-900 mb-2">{t('cgu.acceptation.title')}</h3>
                  <p className="text-slate-600 text-sm">
                    {t('cgu.acceptation.body')}
                    <a
                      href="mailto:contact@examanet.com"
                      className="text-primary-600 font-semibold hover:underline"
                    >
                      contact@examanet.com
                    </a>
                  </p>
                </div>
              </div>
            </div>
          </div>
        </article>
      </main>

      </div>
  );
}
