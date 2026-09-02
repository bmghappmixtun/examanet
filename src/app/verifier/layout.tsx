/**
 * Layout for /verifier (OTP code form).
 *
 * The page itself is 'use client' (interactive OTP input). This layout
 * belongs to the server component layer so we can declare metadata here
 * (Next.js forbids exporting `metadata` from a 'use client' page).
 *
 * noindex: this is a flow page reachable only via /inscription or /connexion
 * → it's not meant to be discovered by search engines or external links.
 */
import type { Metadata } from 'next';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: 'Vérification du code',
};

export default function VerifierLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
