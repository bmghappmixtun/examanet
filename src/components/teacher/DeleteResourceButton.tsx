'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2, X, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';

export default function DeleteResourceButton({
  resourceId,
  resourceTitle,
}: {
  resourceId: string;
  resourceTitle: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [confirmText, setConfirmText] = useState('');

  async function handleDelete() {
    if (confirmText !== 'SUPPRIMER') {
      toast.error('Tapez SUPPRIMER pour confirmer');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/teacher/resources/${resourceId}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) {
        // 2026-09-05: Resource already deleted (stale page view)
        if (res.status === 404 && data?.code === 'NOT_FOUND') {
          setOpen(false);
          setConfirmText('');
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
          return;
        }
        // 2026-09-05: Resource is published — must unpublish first
        if (res.status === 409 && data?.code === 'RESOURCE_PUBLISHED') {
          setOpen(false);
          setConfirmText('');
          toast.error(
            (t) => (
              <div className="max-w-xs">
                <div className="font-semibold mb-1">⚠️ Ressource publiée</div>
                <div className="text-xs opacity-90 mb-2">{data.error}</div>
                <a
                  href="/enseignant/ressources"
                  className="inline-block px-3 py-1.5 text-xs font-bold bg-amber-600 text-white rounded hover:bg-amber-700"
                  onClick={() => toast.dismiss(t.id)}
                >
                  → Aller à Mes ressources
                </a>
              </div>
            ),
            { duration: 8000, style: { maxWidth: '420px' } },
          );
          return;
        }
        throw new Error(data.error || 'Erreur');
      }
      toast.success('Ressource supprimée');
      setOpen(false);
      router.refresh();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Supprimer"
        className="p-2 hover:bg-red-50 rounded-lg text-red-500 hover:text-red-700"
      >
        <Trash2 className="w-4 h-4" />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-5 h-5 text-red-600" />
              </div>
              <div className="flex-1">
                <h3 className="font-bold text-lg">Supprimer cette ressource ?</h3>
                <p className="text-sm text-slate-500 mt-1">
                  Cette action est irréversible. La ressource « {resourceTitle} » et toutes ses
                  données associées (commentaires, notes, favoris, statistiques) seront
                  définitivement supprimées.
                </p>
              </div>
              <button onClick={() => setOpen(false)} className="p-1 hover:bg-slate-100 rounded">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-semibold text-slate-700 mb-1">
                Tapez <span className="text-red-600 font-mono">SUPPRIMER</span> pour confirmer
              </label>
              <input
                type="text"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                className="w-full px-3 py-2 border-2 border-slate-200 rounded-lg focus:border-red-500 outline-none"
                placeholder="SUPPRIMER"
              />
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => {
                  setOpen(false);
                  setConfirmText('');
                }}
                className="flex-1 px-4 py-2.5 rounded-lg border border-slate-200 font-semibold text-slate-700 hover:bg-slate-50"
              >
                Annuler
              </button>
              <button
                onClick={handleDelete}
                disabled={loading || confirmText !== 'SUPPRIMER'}
                className="flex-1 px-4 py-2.5 rounded-lg bg-red-600 text-white font-semibold hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Suppression...' : 'Supprimer définitivement'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
