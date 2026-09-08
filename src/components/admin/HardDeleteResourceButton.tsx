'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2, X, AlertTriangle, Loader2, CheckCircle2 } from 'lucide-react';
import toast from 'react-hot-toast';

/**
 * Button to permanently delete a resource (admin only).
 *
 * 2026-09-05: Added the "nuclear option" for admin cleanup.
 * Wipes from D1 + R2 + all related tables. IRREVERSIBLE.
 *
 * Requires typing the exact resource title to confirm.
 */
export default function HardDeleteResourceButton({
  resourceId,
  resourceTitle,
  size = 'sm',
}: {
  resourceId: string;
  resourceTitle: string;
  size?: 'sm' | 'md';
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    message: string;
    r2?: { attempted: number; deleted: number };
    deletions?: Record<string, number>;
  } | null>(null);

  async function handleDelete() {
    if (confirmText !== resourceTitle) {
      toast.error('Le titre ne correspond pas');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/resource/${resourceId}/hard-delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: resourceTitle }),
      });
      const data = await res.json();
      if (!res.ok) {
        // 2026-09-05: Special handling for "resource not found" — usually means
        // the admin had a stale page view and the resource was already deleted.
        // Show a "Reload" button so they can refresh the list.
        if (res.status === 404 && data?.code === 'NOT_FOUND') {
          toast.error(
            (t) => (
              <div className="max-w-xs">
                <div className="font-semibold mb-1">⚠️ Ressource déjà supprimée</div>
                <div className="text-xs opacity-90 mb-2">{data.error}</div>
                <button
                  onClick={() => {
                    router.refresh();
                    toast.dismiss(t.id);
                  }}
                  className="inline-block px-3 py-1.5 text-xs font-bold bg-sky-600 text-white rounded hover:bg-sky-700"
                >
                  ↻ Recharger la page
                </button>
              </div>
            ),
            { duration: 10000, style: { maxWidth: '420px' } },
          );
          setOpen(false);
          // Auto-refresh after a delay so the list updates
          setTimeout(() => router.refresh(), 3000);
          return;
        }
        throw new Error(data.error || 'Erreur');
      }
      setResult({
        success: true,
        message: data.message,
        r2: data.r2,
        deletions: data.deletions,
      });
      toast.success('Ressource supprimée définitivement');
      // Refresh list after a short delay
      setTimeout(() => {
        setOpen(false);
        router.refresh();
      }, 2500);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }

  const iconSize = size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4';

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="p-1.5 text-slate-400 hover:text-red-700 hover:bg-red-50 rounded transition"
        title="Supprimer définitivement (DANGER)"
      >
        <Trash2 className={iconSize} />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="max-w-lg w-full bg-white rounded-2xl p-6 shadow-2xl">
            {result?.success ? (
              <div className="text-center py-2">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-emerald-100 flex items-center justify-center">
                  <CheckCircle2 className="w-8 h-8 text-emerald-600" />
                </div>
                <h3 className="text-lg font-bold text-slate-900 mb-2">Ressource supprimée</h3>
                {result.r2 && (
                  <p className="text-sm text-slate-600">
                    {result.r2.deleted}/{result.r2.attempted} fichiers R2 supprimés
                  </p>
                )}
                {result.deletions && (
                  <details className="mt-3 text-left text-xs">
                    <summary className="cursor-pointer text-slate-500 hover:text-slate-700">
                      Voir le détail
                    </summary>
                    <pre className="mt-2 p-2 bg-slate-50 rounded text-[10px] overflow-x-auto">
                      {JSON.stringify(result.deletions, null, 2)}
                    </pre>
                  </details>
                )}
              </div>
            ) : (
              <>
                <div className="flex items-start gap-3 mb-4">
                  <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                    <AlertTriangle className="w-5 h-5 text-red-600" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-bold text-red-700">⚠️ Suppression définitive</h3>
                    <p className="text-sm text-slate-600 mt-1">
                      Cette action est <strong>irréversible</strong>. La ressource
                      <strong className="text-slate-800"> « {resourceTitle} » </strong>
                      sera définitivement supprimée.
                    </p>
                  </div>
                  <button onClick={() => setOpen(false)} className="p-1 hover:bg-slate-100 rounded">
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-xs text-red-900">
                  <strong>Ce qui sera supprimé :</strong>
                  <ul className="mt-1 space-y-0.5 list-disc list-inside">
                    <li>La resource de la base de données</li>
                    <li>Les commentaires, notes, favoris, signalements associés</li>
                    <li>L'historique des vues et téléchargements</li>
                    <li>Les métadonnées et résumés IA</li>
                    <li>Le fichier original dans R2 (stockage)</li>
                    <li>Le fichier PDF, la miniature, le thumbnail</li>
                  </ul>
                  <p className="mt-2 font-bold">⚠️ Aucune sauvegarde — action irréversible.</p>
                </div>

                <div className="mb-4">
                  <label className="block text-sm font-semibold text-slate-700 mb-1">
                    Tapez le titre exact pour confirmer :
                  </label>
                  <code className="block text-xs bg-slate-100 p-2 rounded mb-2 text-slate-800 font-mono">
                    {resourceTitle}
                  </code>
                  <input
                    type="text"
                    value={confirmText}
                    onChange={(e) => setConfirmText(e.target.value)}
                    className="w-full px-3 py-2 border-2 border-slate-200 rounded-lg focus:border-red-500 outline-none text-sm"
                    placeholder="Recopier le titre ci-dessus"
                    autoComplete="off"
                  />
                </div>

                <div className="flex gap-2 justify-end">
                  <button
                    onClick={() => {
                      setOpen(false);
                      setConfirmText('');
                    }}
                    disabled={loading}
                    className="px-4 py-2 rounded-lg text-sm font-medium bg-slate-100 text-slate-700 hover:bg-slate-200 transition disabled:opacity-50"
                  >
                    Annuler
                  </button>
                  <button
                    onClick={handleDelete}
                    disabled={loading || confirmText !== resourceTitle}
                    className="px-4 py-2 rounded-lg text-sm font-medium bg-red-600 text-white hover:bg-red-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        Suppression…
                      </>
                    ) : (
                      <>
                        <Trash2 className="w-3.5 h-3.5" />
                        Supprimer définitivement
                      </>
                    )}
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
