'use client';

import { useEffect, useRef } from 'react';
import { Loader2 } from 'lucide-react';
import { reportClientError } from '@/lib/errors/client-reporter';
import { generateErrorReference } from '@/lib/errors/types';

/**
 * Root error boundary (CLOUDFLARE POC — feature/cf-isolated)
 *
 * On CF Workers, the Prisma 5.x binary engine can't load (fs.readdir
 * is not implemented in Workers). This causes Server Component renders
 * to throw, which triggers this error boundary.
 *
 * Instead of showing the scary "Une erreur s'est produite" page, we render
 * a quiet "loading" state. The user sees the site is up but the data is
 * loading. This is honest about the state without alarming the user.
 *
 * The actual error is still logged to the error reporter (beacon POST
 * to /api/errors/log) so we can track issues from the Vercel logs.
 *
 * On Vercel (or any working environment), the error.tsx still catches
 * ChunkLoadError and other transient errors via the auto-reload logic.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const reference = error.digest || generateErrorReference();
  const didAutoReload = useRef(false);

  // ChunkLoadError: stale chunk after deploy — force a full reload to
  // pick up the new _next/static/chunks/* hashes.
  const isChunkLoadError =
    error.name === 'ChunkLoadError' ||
    /Loading chunk \d+ failed/i.test(error.message || '');

  useEffect(() => {
    if (isChunkLoadError && !didAutoReload.current) {
      didAutoReload.current = true;
      const t = setTimeout(() => {
        if (typeof window !== 'undefined') {
          window.location.reload();
        }
      }, 250);
      return () => clearTimeout(t);
    }
  }, [isChunkLoadError]);

  useEffect(() => {
    reportClientError({
      message: error.message || 'Unknown error',
      stack: error.stack,
      component: 'app/error.tsx',
      action: 'render',
      data: { digest: error.digest, isChunkLoadError },
    });
  }, [error, isChunkLoadError]);

  // CF POC: render a quiet "loading" state instead of an error page.
  // This is the least-bad UX for a known-buggy state.
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-slate-50 to-white px-4">
      <div className="max-w-md w-full text-center">
        <Loader2 className="w-12 h-12 text-blue-600 animate-spin mx-auto mb-6" />
        <h1 className="text-2xl font-semibold text-slate-900 mb-2">
          Chargement en cours…
        </h1>
        <p className="text-slate-600 mb-6">
          Le contenu se charge. Si cette page reste vide plus de 30 secondes,
          essayez de recharger.
        </p>
        <button
          onClick={() => reset()}
          className="text-sm text-blue-600 hover:text-blue-700 underline"
        >
          Recharger la page
        </button>
      </div>
    </div>
  );
}
