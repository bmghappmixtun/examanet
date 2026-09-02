'use client';

import { useEffect } from 'react';
import { useLocale } from 'next-intl';
import { isRTL } from '@/i18n/routing';

/**
 * SyncLocaleAttrs — keeps <html dir> and <html lang> in sync with the
 * active locale.
 *
 * Why this is needed:
 * - The root layout (app/layout.tsx) sets <html lang dir> from the URL
 *   on full page load.
 * - But Next.js client-side navigation does NOT re-render the root
 *   <html> tag (only the body content), so switching locale via Link
 *   leaves <html dir="rtl"> even when navigating to /fr/*.
 * - This component runs on every render and updates the document
 *   attributes to match the current locale.
 */
export default function SyncLocaleAttrs() {
  const locale = useLocale();
  
  useEffect(() => {
    const dir = isRTL(locale) ? 'rtl' : 'ltr';
    document.documentElement.lang = locale;
    document.documentElement.dir = dir;
    if (dir === 'rtl') {
      document.body.classList.add('rtl');
    } else {
      document.body.classList.remove('rtl');
    }
  }, [locale]);
  
  return null;
}
