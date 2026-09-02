import type { Metadata } from 'next';
import { Mail, MessageSquare, Phone, MapPin, Clock } from 'lucide-react';
import ContactForm from '@/components/contact/ContactForm';
import { getTranslations, getLocale } from 'next-intl/server';
import { breadcrumbSchema, SITE_URL } from '@/lib/structured-data';

export const revalidate = 3600; // 1 hour cache

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const isAr = locale === 'ar';
  return {
    title: isAr ? 'اتصل بنا — إكسامانت' : 'Contact — Nous contacter',
    description: isAr
      ? 'تواصل مع فريق إكسامانت. سؤال، خطأ، اقتراح؟ سنرد عليك خلال 24-48 ساعة.'
      : "Contactez l'équipe Examanet. Une question, un bug, une suggestion ? Nous vous répondons sous 24-48h.",
    alternates: isAr ? { canonical: '/ar/contact' } : { canonical: '/fr/contact' },
    openGraph: {
      title: isAr ? 'اتصل بإكسامانت' : 'Contact Examanet',
      description: isAr
        ? 'اطرح أسئلتك، أبلغ عن خطأ أو اقترح تحسيناً.'
        : 'Posez vos questions, signalez un bug ou suggérez une amélioration.',
      url: isAr ? '/contact' : '/contact',
      type: isAr ? 'website' : 'website',
      locale: isAr ? 'ar_TN' : 'fr_TN',
    },
  };
}

const breadcrumbJsonLd = breadcrumbSchema([
  { name: 'Accueil', url: SITE_URL },
  { name: 'Contact', url: `${SITE_URL}/contact` },
]);

export default async function ContactPage() {
  const t = await getTranslations();

  return (
    <div className="min-h-screen flex flex-col">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      <main className="flex-1 pt-16 lg:pt-20">
        {/* HERO */}
        <section className="bg-gradient-to-br from-primary-50 via-white to-sky-50 py-16">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <div className="inline-flex items-center gap-2 bg-white border border-primary-200 rounded-full px-4 py-2 mb-6 shadow-sm">
              <Mail className="w-4 h-4 text-primary-600" />
              <span className="text-xs font-semibold text-slate-700">{t('contact.badge')}</span>
            </div>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold leading-tight mb-4">
              <span className="gradient-text">{t('contact.hero.title')}</span>
            </h1>
            <p className="text-lg lg:text-xl text-slate-600 max-w-2xl mx-auto">
              {t('contact.hero.subtitle')}
            </p>
          </div>
        </section>

        {/* Contact info + form */}
        <section className="py-16 bg-white">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid lg:grid-cols-3 gap-8">
              {/* Coordonnées */}
              <div className="space-y-4">
                <h2 className="text-2xl font-extrabold mb-6">{t('contact.info.title')}</h2>

                <div className="bg-white rounded-2xl border border-slate-200 p-5 hover:border-primary-300 transition">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-primary-100 text-primary-600 flex items-center justify-center flex-shrink-0">
                      <Mail className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-slate-500 mb-1">
                        {t('contact.info.email')}
                      </div>
                      <a
                        href="mailto:contact@examanet.com"
                        className="text-slate-900 font-semibold hover:text-primary-600"
                      >
                        contact@examanet.com
                      </a>
                      <div className="text-xs text-slate-500 mt-1">
                        {t('contact.info.emailResponse')}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-2xl border border-slate-200 p-5 hover:border-primary-300 transition">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center flex-shrink-0">
                      <Phone className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-slate-500 mb-1">
                        {t('contact.info.phone')}
                      </div>
                      <div className="text-slate-900 font-semibold">+216 50 000 000</div>
                      <div className="text-xs text-slate-500 mt-1">
                        {t('contact.info.phoneHours')}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-2xl border border-slate-200 p-5 hover:border-primary-300 transition">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center flex-shrink-0">
                      <MapPin className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-slate-500 mb-1">
                        {t('contact.info.address')}
                      </div>
                      <div className="text-slate-900 font-semibold">Tunis, Tunisie</div>
                      <div className="text-xs text-slate-500 mt-1">
                        {t('contact.info.addressHQ')}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-2xl border border-slate-200 p-5 hover:border-primary-300 transition">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-purple-100 text-purple-600 flex items-center justify-center flex-shrink-0">
                      <Clock className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-slate-500 mb-1">
                        {t('contact.info.responseTime')}
                      </div>
                      <div className="text-slate-900 font-semibold">
                        {t('contact.info.responseValue')}
                      </div>
                      <div className="text-xs text-slate-500 mt-1">
                        {t('contact.info.workDays')}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Réseaux sociaux */}
                <div className="mt-6">
                  <div className="text-sm font-semibold text-slate-500 mb-3">
                    {t('contact.info.followUs')}
                  </div>
                  <div className="flex gap-2">
                    {[
                      { name: 'Facebook', icon: '📘', url: '#' },
                      { name: 'Twitter', icon: '🐦', url: '#' },
                      { name: 'Instagram', icon: '📷', url: '#' },
                      { name: 'YouTube', icon: '▶️', url: '#' },
                    ].map((s) => (
                      <a
                        key={s.name}
                        href={s.url}
                        aria-label={s.name}
                        className="w-10 h-10 rounded-full bg-white border border-slate-200 hover:border-primary-400 hover:bg-primary-50 flex items-center justify-center transition text-xl"
                      >
                        {s.icon}
                      </a>
                    ))}
                  </div>
                </div>
              </div>

              {/* Formulaire */}
              <div className="lg:col-span-2">
                <div className="bg-white rounded-2xl border border-slate-200 p-6 lg:p-8 shadow-sm">
                  <div className="flex items-center gap-2 mb-6">
                    <MessageSquare className="w-5 h-5 text-primary-600" />
                    <h2 className="text-2xl font-extrabold">{t('contact.form.title')}</h2>
                  </div>

                  <ContactForm />
                </div>

                {/* FAQ rapide */}
                <div className="mt-6 grid sm:grid-cols-2 gap-4">
                  {[
                    { q: t('contact.faq.q1'), a: t('contact.faq.a1') },
                    { q: t('contact.faq.q2'), a: t('contact.faq.a2') },
                    { q: t('contact.faq.q3'), a: t('contact.faq.a3') },
                    { q: t('contact.faq.q4'), a: t('contact.faq.a4') },
                  ].map((f, i) => (
                    <details key={i} className="bg-slate-50 rounded-xl p-4 cursor-pointer group">
                      <summary className="font-semibold text-slate-900 flex items-center justify-between">
                        {f.q}
                        <span className="text-slate-400 group-open:rotate-180 transition-transform">
                          ▼
                        </span>
                      </summary>
                      <p className="mt-2 text-sm text-slate-600">{f.a}</p>
                    </details>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      </div>
  );
}
