// 2026-09-14: Minimal layout for /verifier (no Header/Footer)
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Vérifier votre email',
  robots: { index: false, follow: true, nocache: true, googleBot: { index: false, follow: true } },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
