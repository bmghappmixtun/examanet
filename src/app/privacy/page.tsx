import { redirect } from 'next/navigation';
import { headers } from 'next/headers';

/**
 * /privacy → /[locale]/politique-confidentialite
 * 
 * Stable URL for Google OAuth verification and external services.
 * The actual content lives at /[locale]/politique-confidentialite
 * and respects the user's language (FR/AR).
 */
export default function PrivacyRedirect() {
  // Use Accept-Language header to pick the best locale
  const acceptLanguage = headers().get('accept-language') || '';
  const locale = acceptLanguage.startsWith('ar') ? 'ar' : 'fr';
  redirect(`/${locale}/politique-confidentialite`);
}
