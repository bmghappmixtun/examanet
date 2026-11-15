'use client';

/**
 * 2026-11-15 — HOTFIX (le site était 500 sur toutes les pages /[locale]).
 *
 * `NextIntlClientProvider` est un CLIENT COMPONENT : un composant serveur
 * ne peut PAS lui passer des fonctions (elles ne sont pas sérialisables dans
 * le payload RSC). Passer `onError` / `getMessageFallback` depuis
 * `src/app/[locale]/layout.tsx` déclenchait :
 *
 *   Error: Event handlers cannot be passed to Client Component props.
 *   {formats: undefined, locale: "fr", messages: ..., onError: function i,
 *    getMessageFallback: ..., children: ...}
 *                              ^^^^^^^^^^
 *
 * → exception React au rendu → 500 sur TOUTES les pages `/fr/*` et `/ar/*`
 *   (prod comme dev). Le trait d'union sous `onError` pointait le coupable.
 *
 * Correctif : ce wrapper est lui-même un client component. Il définit les
 * handlers côté client (log seul, JAMAIS de throw — un throw ici casserait
 * le rendu client) et transmet les messages au provider.
 *
 * Le comportement strict (throw en dev) reste côté SERVEUR, via
 * `getRequestConfig` (src/i18n/request.ts), où les fonctions sont légales.
 */

import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { formatIntlError } from '@/i18n/error-handlers';

type Props = {
  locale: string;
  messages: Record<string, unknown>;
  children: ReactNode;
};

export default function IntlClientProvider({ locale, messages, children }: Props) {
  // Client-side : journalisation seule, jamais de throw.
  const onError = (error: unknown) => {
    console.error(formatIntlError(error));
  };

  const getMessageFallback = ({
    key,
    namespace,
    error,
  }: {
    key: string;
    namespace?: string;
    error: unknown;
  }) => {
    console.error(formatIntlError(error, key, namespace));
    return key;
  };

  return (
    <NextIntlClientProvider
      locale={locale}
      messages={messages as Parameters<typeof NextIntlClientProvider>[0]['messages']}
      onError={onError}
      getMessageFallback={getMessageFallback}
    >
      {children}
    </NextIntlClientProvider>
  );
}
