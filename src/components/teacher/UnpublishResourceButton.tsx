'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { EyeOff, X, AlertTriangle, CheckCircle2 } from 'lucide-react';
import toast from 'react-hot-toast';

/**
 * Button to unpublish a published resource.
 * 2026-09-05: Added so teachers can clean up their library and delete files.
 *
 * Flow:
 * 1. Click "Dépublier" → modal asks confirmation
 * 2. POST /api/teacher/resources/[id]/unpublish
 * 3. Server sets status=DRAFT, isHidden=1, unlinks TeacherFile
 * 4. Server notifies admins
 * 5. Resource disappears from public site
 * 6. Teacher can now delete the original file from their library
 */
export default function UnpublishResourceButton({
  resourceId,
  resourceTitle,
  size = 'md',
}: {
  resourceId: string;
  resourceTitle: string;
  size?: 'sm' | 'md';
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function handleUnpublish() {
    setLoading(true);
    try {
      const res = await fetch(`/api/teacher/resources/${resourceId}/unpublish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur');
      setDone(true);
      toast.success('Ressource dépubliée. Vous pouvez maintenant supprimer le fichier de votre bibliothèque.');
      // Refresh after a short delay so the user sees the success state
      setTimeout(() => {
        setOpen(false);
        router.refresh();
      }, 1800);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }

  const iconSize = size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4';
  const btnClass = size === 'sm'
    ? 'inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 rounded-lg transition'
    : 'p-2 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded transition';

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={btnClass}
        title="Dépublier (retirer de la plateforme)"
      >
        <EyeOff className={iconSize} />
        {size === 'sm' && 'Dépublier'}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="max-w-md w-full bg-white rounded-2xl p-6 shadow-2xl">
            {done ? (
              <div className="text-center py-4">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-emerald-100 flex items-center justify-center">
                  <CheckCircle2 className="w-8 h-8 text-emerald-600" />
                </div>
                <h3 className="text-lg font-bold text-slate-900 mb-2">Ressource dépubliée</h3>
                <p className="text-sm text-slate-600">
                  La ressource n'est plus visible sur la plateforme.
                </p>
                <p className="text-xs text-slate-500 mt-2">
                  Vous pouvez maintenant supprimer le fichier de votre bibliothèque.
                </p>
              </div>
            ) : (
              <>
                <div className="flex items-start gap-3 mb-4">
                  <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                    <AlertTriangle className="w-5 h-5 text-amber-600" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-slate-900">Dépublier cette ressource ?</h3>
                    <p className="text-sm text-slate-600 mt-1">
                      La ressource <strong className="text-slate-800">« {resourceTitle} »</strong> sera
                      retirée de la plateforme. Les élèves ne pourront plus la voir ni la télécharger.
                    </p>
                  </div>
                </div>

                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4 text-xs text-amber-800">
                  <strong>ℹ️ Bon à savoir :</strong>
                  <ul className="mt-1 space-y-0.5 list-disc list-inside">
                    <li>L'historique (vues, téléchargements) sera préservé</li>
                    <li>Le fichier original reste dans votre bibliothèque</li>
                    <li>Vous pourrez ensuite supprimer le fichier si vous le souhaitez</li>
                    <li>L'administrateur sera notifié</li>
                  </ul>
                </div>

                <div className="flex gap-2 justify-end">
                  <button
                    onClick={() => setOpen(false)}
                    disabled={loading}
                    className="px-4 py-2 rounded-lg text-sm font-medium bg-slate-100 text-slate-700 hover:bg-slate-200 transition disabled:opacity-50"
                  >
                    Annuler
                  </button>
                  <button
                    onClick={handleUnpublish}
                    disabled={loading}
                    className="px-4 py-2 rounded-lg text-sm font-medium bg-amber-600 text-white hover:bg-amber-700 transition disabled:opacity-50 flex items-center gap-1.5"
                  >
                    {loading ? 'Dépublication…' : 'Dépublier'}
                    <EyeOff className="w-3.5 h-3.5" />
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
