import type { Metadata } from 'next';
import { WifiOff, Home } from 'lucide-react';
import Link from 'next/link';
import RefreshButton from './RefreshButton';

export const metadata: Metadata = {
  title: 'Hors ligne — Examanet',
  description: 'Vous êtes hors ligne. Vérifiez votre connexion internet.',
  robots: { index: false, follow: false },
};

export default function OfflinePage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-sky-50 to-amber-50 px-4">
      <div className="max-w-md w-full text-center">
        <div className="mb-6 inline-flex items-center justify-center w-20 h-20 rounded-full bg-amber-100">
          <WifiOff className="w-10 h-10 text-amber-600" aria-hidden="true" />
        </div>
        <h1 className="text-3xl font-bold text-slate-900 mb-3">Vous êtes hors ligne</h1>
        <p className="text-slate-600 mb-8">
          Pas de connexion internet pour le moment. Cette page a été mise en cache
          pour que vous puissiez la consulter même sans réseau.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <RefreshButton />
          <Link
            href="/"
            className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-white border border-slate-200 text-slate-700 font-medium hover:bg-slate-50 transition min-h-[44px]"
          >
            <Home className="w-4 h-4" />
            Accueil
          </Link>
        </div>
      </div>
    </div>
  );
}
