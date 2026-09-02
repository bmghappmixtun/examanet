'use client';
import { I18nProvider } from '@/lib/i18n';

export default function I18nProviderWrapper({
  children,
  initialLocale,
}: {
  children: React.ReactNode;
  initialLocale?: 'fr' | 'ar';
}) {
  return <I18nProvider initialLocale={initialLocale}>{children}</I18nProvider>;
}
