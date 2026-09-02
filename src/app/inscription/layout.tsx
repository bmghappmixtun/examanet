import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Inscription',
  robots: { index: false, follow: true, nocache: true, googleBot: { index: false, follow: true } },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
