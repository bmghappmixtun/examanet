'use client';

import { useEffect } from 'react';
import { Library, RefreshCw, ArrowLeft } from 'lucide-react';
import NextLink from 'next/link';

/**
 * Error boundary for /enseignant/bibliotheque
 * Shows a clear error message + retry button if anything throws.
 */
export default function LibraryError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[bibliotheque error]', error);
  }, [error]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-white rounded-2xl border border-red-200 p-8 text-center">
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-100 flex items-center justify-center">
          <Library className="w-8 h-8 text-red-500" />
        </div>
        <h2 className="text-2xl font-bold text-slate-900 mb-2">
          Erreur de chargement
        </h2>
        <p className="text-slate-600 mb-6">
          La bibliothèque n'a pas pu se charger. Réessayez dans un instant.
        </p>
        {error.digest && (
          <p className="text-xs text-slate-400 font-mono mb-4">
            Code: {error.digest}
          </p>
        )}
        <div className="flex flex-col sm:flex-row gap-2 justify-center">
          <button
            onClick={reset}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg font-medium bg-primary text-white hover:bg-primary/90 transition shadow-sm"
          >
            <RefreshCw className="w-4 h-4" />
            Réessayer
          </button>
          <NextLink
            href="/enseignant"
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg font-medium bg-slate-100 text-slate-700 hover:bg-slate-200 transition"
          >
            <ArrowLeft className="w-4 h-4" />
            Tableau de bord
          </NextLink>
        </div>
      </div>
    </div>
  );
}
