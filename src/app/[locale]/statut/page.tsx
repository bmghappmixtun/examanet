import type { Metadata } from 'next';
import { Activity } from 'lucide-react';
import { getTranslations, getLocale } from 'next-intl/server';
import { localeAlternatesFor } from '@/lib/seo-alternates';
import ServiceStatusPanel from '@/components/status/ServiceStatusPanel';
import { EXAMANET_MONITOR_LABELS } from '@/lib/service-status';

export const revalidate = 300; // 5 min : la page reprend l'état des moniteurs

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const isAr = locale === 'ar';
  return {
    title: isAr ? 'حالة الخدمة — إكسامانت' : 'État du service — Examanet',
    description: isAr
      ? 'توفّر منصة إكسامانت في الوقت الحقيقي: حالة الموقع وواجهات الخدمة وآخر vérification.'
      : "Disponibilité en temps réel de la plateforme Examanet : état du site, des interfaces et dernière vérification.",
    alternates: localeAlternatesFor('/statut', isAr ? 'ar' : 'fr'),
    // Contenu vivant (rendu côté client) : page crawlable mais non indexée,
    // comme les pages de section à contenu maigre.
    robots: { index: false, follow: true },
  };
}

export default async function StatutPage() {
  const t = await getTranslations();
  const locale = await getLocale();

  const labels = {
    allOperational: t('status.allOperational'),
    degraded: t('status.degraded'),
    down: t('status.down'),
    checking: t('status.checking'),
    lastCheck: t('status.lastCheck'),
    services: t('status.services'),
    up: t('status.up'),
    downLabel: t('status.downLabel'),
    history: t('status.history'),
    historyCta: t('status.historyCta'),
    refreshNote: t('status.refreshNote'),
    error: t('status.error'),
    monitorFr: t('status.monitorFr'),
    monitorHealth: t('status.monitorHealth'),
    monitorWww: t('status.monitorWww'),
  };

  return (
    <div className="min-h-screen flex flex-col">
      <main className="flex-1 pt-16 lg:pt-20">
        {/* HERO */}
        <section className="bg-gradient-to-br from-primary-50 via-white to-sky-50 py-12 lg:py-16">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center gap-2 mb-4">
              <Activity className="w-5 h-5 text-primary-600" />
              <span className="text-sm font-bold text-primary-600">{t('status.badge')}</span>
            </div>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold mb-4">
              {t('status.hero.title')}
            </h1>
            <p className="text-lg text-slate-600 max-w-2xl">{t('status.hero.intro')}</p>
          </div>
        </section>

        {/* PANNEAU LIVE */}
        <section className="py-12 lg:py-16 bg-white">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <ServiceStatusPanel
              labels={labels}
              locale={locale}
              monitorLabels={EXAMANET_MONITOR_LABELS}
            />
          </div>
        </section>
      </main>
    </div>
  );
}
