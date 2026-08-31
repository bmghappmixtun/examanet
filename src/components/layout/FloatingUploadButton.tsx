'use client';
import NextLink from 'next/link';
import { Upload, Lock } from 'lucide-react';
import { useState, useEffect } from 'react';

/**
 * Floating Action Button (FAB) for quick resource upload.
 * Visible only inside the teacher space.
 *
 * - Hidden on /enseignant/ajouter itself
 * - Disabled (grey + lock icon) when teacher is not ACTIVE
 * - On click → /enseignant/ajouter
 */
export default function FloatingUploadButton() {
  const [expanded, setExpanded] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [canUpload, setCanUpload] = useState<boolean | null>(null);
  const [statusMessage, setStatusMessage] = useState<string>('');

  useEffect(() => {
    // Auto-hide on the upload page itself
    if (
      typeof window !== 'undefined' &&
      window.location.pathname.startsWith('/enseignant/ajouter')
    ) {
      setHidden(true);
      return;
    }
    // Check user status
    fetch('/api/teacher/status')
      .then((r) => r.json())
      .then((data) => {
        if (data?.canUpload) {
          setCanUpload(true);
        } else {
          setCanUpload(false);
          setStatusMessage(data?.message || 'Action désactivée');
        }
      })
      .catch(() => setCanUpload(true)); // default to enabled if API fails
  }, []);

  if (hidden) return null;

  // If loading or allowed, show the orange FAB
  if (canUpload === null || canUpload === true) {
    return (
      <div className="fixed end-6 z-40 flex flex-col items-end gap-3 print:hidden safe-bottom">
        {expanded && (
          <div
            role="button"
            tabIndex={0}
            className="bg-slate-900 text-white text-sm font-semibold px-4 py-2 rounded-xl shadow-xl animate-in fade-in slide-in-from-bottom-2 duration-200 cursor-pointer"
            onClick={() => (window.location.href = '/enseignant/ajouter')}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') (window.location.href = '/enseignant/ajouter'); }}
          >
            Ajouter une ressource
          </div>
        )}

        <NextLink
          href="/enseignant/ajouter"
          onMouseEnter={() => setExpanded(true)}
          onMouseLeave={() => setExpanded(false)}
          onFocus={() => setExpanded(true)}
          onBlur={() => setExpanded(false)}
          className="group relative w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-2xl hover:shadow-amber-500/50 hover:scale-110 active:scale-95 transition-all flex items-center justify-center"
          aria-label="Ajouter une ressource"
          title="Ajouter une ressource"
        >
          <span className="absolute inset-0 rounded-full bg-amber-400 animate-ping opacity-20" />
          <Upload className="w-6 h-6 sm:w-7 sm:h-7 relative z-10" strokeWidth={2.5} />
          <span className="absolute -top-1 -end-1 w-5 h-5 bg-white text-orange-600 rounded-full flex items-center justify-center text-xs font-extrabold shadow-md">
            +
          </span>
        </NextLink>
      </div>
    );
  }

  // Disabled state
  return (
    <div className="fixed end-6 z-40 flex flex-col items-end gap-2 print:hidden safe-bottom">
      {expanded && (
        <div className="bg-slate-900 text-white text-xs font-semibold px-4 py-2 rounded-xl shadow-xl max-w-xs text-right">
          {statusMessage}
        </div>
      )}
      <div
        role="button"
        tabIndex={-1}
        title={statusMessage}
        onMouseEnter={() => setExpanded(true)}
        onMouseLeave={() => setExpanded(false)}
        className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-slate-300 text-slate-500 shadow-lg flex items-center justify-center cursor-not-allowed"
        aria-label="Upload désactivé"
      >
        <Lock className="w-6 h-6 sm:w-7 sm:h-7" strokeWidth={2.5} />
      </div>
    </div>
  );
}
