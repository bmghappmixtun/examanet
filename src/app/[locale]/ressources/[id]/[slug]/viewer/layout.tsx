import type { Metadata } from 'next';

// The /ressources/[slug]/viewer page is a PDF viewer (no SEO value, heavy)
export const metadata: Metadata = {
  title: 'Lecteur PDF',
  robots: { index: false, follow: true, nocache: true, googleBot: { index: false, follow: true } },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
