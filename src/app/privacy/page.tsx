import { redirect } from 'next/navigation';

/**
 * /privacy → /fr/politique-confidentialite
 * 
 * Stable English URL for Google OAuth verification and external services.
 */
export default function PrivacyRedirect() {
  redirect('/fr/politique-confidentialite');
}
