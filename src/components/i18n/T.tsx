'use client';
import { useTranslations } from 'next-intl';

/**
 * Translator component - use anywhere you need translated text
 * Usage: <T k="common.search" /> or <T k="home.heroTitle" />
 */
export default function T({ k }: { k: string }) {
  const t = useTranslations();
  return <>{t(k)}</>;
}
