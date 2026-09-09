import { redirect } from 'next/navigation';
import { headers } from 'next/headers';

/**
 * /politique-confidentialite → /[locale]/politique-confidentialite
 * 
 * Stable French URL for Google OAuth verification and external services.
 * The actual content lives at /[locale]/politique-confidentialite
 * and respects the user's language.
 */
export default function PrivacyPolicyRedirect() {
  const acceptLanguage = headers().get('accept-language') || '';
  const locale = acceptLanguage.startsWith('ar') ? 'ar' : 'fr';
  redirect(`/${locale}/politique-confidentialite`);
}
