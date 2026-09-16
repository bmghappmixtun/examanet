import type { Metadata } from 'next';
import { Shield, CheckCircle } from 'lucide-react';
import { getTranslations, getLocale, getMessages } from 'next-intl/server';
import { breadcrumbSchema, SITE_URL } from '@/lib/structured-data';

export const revalidate = 3600; // 1 hour cache

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const isAr = locale === 'ar';
  return {
    title: isAr
      ? 'سياسة الخصوصية — إكسامانت'
      : 'Politique de confidentialité — Examanet',
    description: isAr
      ? 'سياسة الخصوصية لمنصة إكسامانت. كيف نحمي بياناتك الشخصية.'
      : "Politique de confidentialité d'Examanet. Comment nous protégeons tes données personnelles.",
    alternates: isAr
      ? { canonical: '/ar/politique-confidentialite' }
      : { canonical: '/fr/politique-confidentialite' },
    robots: { index: true, follow: true }, // Public legal page
  };
}

const breadcrumbJsonLd = breadcrumbSchema([
  { name: 'Accueil', url: SITE_URL },
  { name: 'Politique de confidentialité', url: `${SITE_URL}/politique-confidentialite` },
]);

export default async function PrivacyPage() {
  const t = await getTranslations();
  const messages = await getMessages();
  const sections =
    (messages.privacy?.sections as Array<{ id: string; title: string; content: string }>) || [];

  return (
    <div className="min-h-screen flex flex-col">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      <main className="flex-1 pt-16 lg:pt-20">
        {/* HERO */}
        <section className="bg-gradient-to-br from-emerald-50 via-white to-sky-50 py-12 lg:py-16">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center gap-2 mb-4">
              <Shield className="w-5 h-5 text-emerald-600" />
              <span className="text-sm font-bold text-emerald-600">{t('privacy.badge')}</span>
            </div>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold mb-4">
              {t('privacy.hero.title')}
            </h1>
            <p className="text-lg text-slate-600 mb-2">
              {t('privacy.hero.lastUpdate')}
              <strong>{t('privacy.hero.lastUpdateDate')}</strong>
            </p>
            <p className="text-slate-500">{t('privacy.hero.intro')}</p>
          </div>
        </section>

        {/* Engagement */}
        <section className="py-8 bg-emerald-50 border-y border-emerald-200">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-start gap-3">
              <CheckCircle className="w-6 h-6 text-emerald-600 flex-shrink-0 mt-1" />
              <div>
                <h3 className="font-bold text-slate-900 mb-2">{t('privacy.engagement.title')}</h3>
                <p className="text-slate-700 text-sm leading-relaxed">
                  {t('privacy.engagement.body')}
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Sommaire */}
        <section className="py-8 bg-slate-50 border-b border-slate-200">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-3">
              {t('privacy.sommaire')}
            </h2>
            <div className="grid sm:grid-cols-2 gap-x-6 gap-y-1 text-sm">
              {sections.map((s) => (
                <a
                  key={s.id}
                  href={`#${s.id}`}
                  className="text-emerald-600 hover:text-emerald-700 hover:underline py-1"
                >
                  {`→ ${s.title}`}
                </a>
              ))}
            </div>
          </div>
        </section>

        {/* Contenu */}
        <article className="py-16 bg-white">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            {sections.map((s, i) => (
              <section key={s.id} id={s.id} className="mb-12 scroll-mt-20">
                <h2 className="text-2xl font-extrabold text-slate-900 mb-4 flex items-center gap-3">
                  <span className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center text-sm font-bold flex-shrink-0">
                    {i + 1}
                  </span>
                  {s.title}
                </h2>
                <div className="prose prose-slate max-w-none text-slate-600 leading-relaxed whitespace-pre-line">
                  {s.content}
                </div>
              </section>
            ))}

            {/* Contact final */}
            <div className="mt-12 p-6 bg-gradient-to-br from-emerald-50 to-sky-50 border border-emerald-200 rounded-2xl">
              <div className="flex items-start gap-3">
                <Shield className="w-6 h-6 text-emerald-600 flex-shrink-0 mt-1" />
                <div>
                  <h3 className="font-bold text-slate-900 mb-2">Contact DPO</h3>
                  <p className="text-slate-600 text-sm">
                    Pour toute question sur tes données, contacte-nous à{' '}
                    <a
                      href="mailto:contact@examanet.com"
                      className="text-emerald-600 font-semibold hover:underline"
                    >
                      contact@examanet.com
                    </a>
                    . Réponse sous 7 jours ouvrés.
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
