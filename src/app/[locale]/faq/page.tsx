import type { Metadata } from 'next';
import { Link } from '@/i18n/navigation';
import { getTranslations, getLocale, getMessages } from 'next-intl/server';
import { faqSchema, breadcrumbSchema } from '@/lib/structured-data';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://examanet.com';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const isAr = locale === 'ar';
  return {
    title: isAr ? 'الأسئلة الشائعة — إكسامانت' : 'FAQ — Questions fréquentes',
    description: isAr
      ? 'جميع الإجابات على أسئلتك حول إكسامانت: دروس مجانية، مستويات، مواد، معلمون، تحميل.'
      : 'Toutes les réponses à vos questions sur Examanet : cours gratuits, niveaux, matières, enseignants, téléchargement.',
    alternates: isAr ? { canonical: '/ar/faq' } : { canonical: '/fr/faq' },
    openGraph: {
      title: isAr ? 'الأسئلة الشائعة إكسامانت' : 'FAQ Examanet',
      description: isAr
        ? 'اعثر بسرعة على إجابات أسئلتك حول إكسامانت.'
        : 'Trouvez rapidement les réponses à vos questions sur Examanet.',
      url: isAr ? '/faq' : '/faq',
      type: isAr ? 'website' : 'website',
      locale: isAr ? 'ar_TN' : 'fr_TN',
    },
  };
}

export default async function FAQPage() {
  const t = await getTranslations();
  const dict = await getTranslations();
  const messages = await getMessages();
  const FAQS =
    (messages.faq?.sections as Array<{
      category: string;
      questions: Array<{ q: string; a: string }>;
    }>) || [];

  // Flatten FAQs for schema
  const flatFaqs = FAQS.flatMap((c) => c.questions).map((f) => ({ question: f.q, answer: f.a }));
  const jsonLd = faqSchema(flatFaqs);
  const breadcrumbJsonLd = breadcrumbSchema([
    { name: 'Accueil', url: SITE_URL },
    { name: 'FAQ', url: `${SITE_URL}/faq` },
  ]);

  return (
    <div className="min-h-screen flex flex-col">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      <main className="flex-1 pt-20">
        <div className="bg-gradient-to-br from-primary-50 to-sky-50 py-12">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <nav
              aria-label="Fil d'Ariane"
              className="flex items-center gap-2 text-sm text-slate-500 mb-4"
            >
              <Link href="/" className="hover:text-primary-600">
                {t('common.home')}
              </Link>
              <span className="text-slate-300">›</span>
              <span className="text-slate-900 font-semibold">FAQ</span>
            </nav>
            <h1 className="text-4xl lg:text-5xl font-extrabold mb-3">{t('faq.hero.title')}</h1>
            <p className="text-lg text-slate-600">{t('faq.hero.subtitle')}</p>
          </div>
        </div>

        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-10">
          {FAQS.map((section, idx) => (
            <section key={idx}>
              <h2 className="text-2xl font-bold mb-4 text-slate-900">{section.category}</h2>
              <div className="space-y-3">
                {section.questions.map((faq, i) => (
                  <details
                    key={i}
                    className="bg-white rounded-xl border border-slate-200 hover:border-primary-300 transition group"
                  >
                    <summary className="cursor-pointer p-5 font-semibold text-slate-900 flex items-center justify-between gap-3 list-none">
                      <span>{faq.q}</span>
                      <span className="text-primary-600 text-xl group-open:rotate-45 transition-transform flex-shrink-0">
                        +
                      </span>
                    </summary>
                    <div className="px-5 pb-5 text-slate-700 leading-relaxed border-t border-slate-100 pt-4">
                      {faq.a}
                    </div>
                  </details>
                ))}
              </div>
            </section>
          ))}

          <section className="bg-gradient-to-br from-primary-50 to-sky-50 rounded-2xl p-8 text-center border border-primary-100">
            <h2 className="text-2xl font-bold mb-2">{t('faq.contact.title')}</h2>
            <p className="text-slate-600 mb-4">{t('faq.contact.subtitle')}</p>
            <Link
              href="/contact"
              className="inline-flex items-center gap-2 px-6 py-3 bg-primary-600 text-white font-semibold rounded-xl hover:bg-primary-700 transition"
            >
              {t('faq.contact.cta')}
            </Link>
          </section>
        </div>
      </main>

      </div>
  );
}
