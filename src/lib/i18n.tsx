'use client';
import { createContext, useContext, useEffect, useState } from 'react';
import fr from '@/messages/fr.json';
import ar from '@/messages/ar.json';
import { safeGetItem, safeSetItem } from '@/lib/safeStorage';

type Locale = 'fr' | 'ar';
type Messages = typeof fr;

const messages: Record<Locale, Messages> = { fr, ar };

interface I18nContextType {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: string, vars?: Record<string, string>) => string;
  dir: 'ltr' | 'rtl';
}

const I18nContext = createContext<I18nContextType | null>(null);

function getNested(obj: any, path: string): any {
  return path.split('.').reduce((acc, key) => acc?.[key], obj);
}

export function I18nProvider({
  children,
  initialLocale,
}: {
  children: React.ReactNode;
  initialLocale?: Locale;
}) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale || 'fr');

  // Load saved locale (from localStorage OR cookie)
  useEffect(() => {
    // Priority: localStorage > cookie > default 'fr'
    // Use safeGetItem — Safari private mode + some iframe contexts throw a
    // SecurityError on `window.localStorage` access itself (not just .getItem).
    // Wrapping in safeGetItem keeps the provider safe on every page mount.
    const saved = safeGetItem('locale') as Locale | null;
    if (saved && (saved === 'fr' || saved === 'ar')) {
      setLocaleState(saved);
      return;
    }
    // Fallback to cookie (in case user switched via server-rendered page)
    const cookieLocale = document.cookie
      .split('; ')
      .find((c) => c.startsWith('locale='))
      ?.split('=')[1] as Locale | undefined;
    if (cookieLocale && (cookieLocale === 'fr' || cookieLocale === 'ar')) {
      setLocaleState(cookieLocale);
    }
  }, []);

  // Update HTML lang/dir attributes
  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === 'ar' ? 'rtl' : 'ltr';
    if (locale === 'ar') {
      document.body.classList.add('rtl');
    } else {
      document.body.classList.remove('rtl');
    }
  }, [locale]);

  function setLocale(l: Locale) {
    setLocaleState(l);
    // safeSetItem is a no-op when storage is unavailable (Safari private mode,
    // disabled cookies, etc.) — keeps the UI responsive without throwing.
    safeSetItem('locale', l);
  }

  function t(key: string, vars?: Record<string, string>): string {
    const value = getNested(messages[locale], key);
    if (typeof value !== 'string') return key;
    if (!vars) return value;
    return Object.entries(vars).reduce(
      (acc, [k, v]) => acc.replace(new RegExp(`\\{${k}\\}`, 'g'), v),
      value,
    );
  }

  const dir: 'ltr' | 'rtl' = locale === 'ar' ? 'rtl' : 'ltr';

  return (
    <I18nContext.Provider value={{ locale, setLocale, t, dir }}>{children}</I18nContext.Provider>
  );
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}
