// 2026-09-14: Minimal layout for /invitation/[token] (no Header/Footer) — overrides [locale] layout
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Activer votre compte — Examanet',
  description: 'Activez votre compte enseignant Examanet en quelques clics.',
  robots: 'noindex, nofollow',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
