// 2026-09-14: Minimal layout for /mot-de-passe-oublie (no Header/Footer)
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Mot de passe oublié',
  robots: { index: false, follow: true, nocache: true, googleBot: { index: false, follow: true } },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
