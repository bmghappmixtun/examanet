'use client';
import { useState } from 'react';
import { Trash2, AlertTriangle, Loader2, X, FileText, FolderOpen } from 'lucide-react';
import toast from 'react-hot-toast';

export default function DeleteUserButton({
  userId,
  userName,
  isAdmin,
  resourcesCount = 0,
}: {
  userId: string;
  userName: string;
  isAdmin: boolean;
  resourcesCount?: number;
}) {
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [keepFiles, setKeepFiles] = useState(false);
  const [loading, setLoading] = useState(false);

  if (isAdmin) {
    return (
      <span
        title="Impossible de supprimer un admin"
        className="text-xs text-slate-300 cursor-not-allowed"
      >
        🛡️
      </span>
    );
  }

  async function handleDelete() {
    if (confirmText !== 'SUPPRIMER') {
      toast.error('Tapez SUPPRIMER en majuscules pour confirmer');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/users/${userId}/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keepFiles }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Erreur');
        return;
      }
      toast.success(data.message);
      setTimeout(() => window.location.reload(), 800);
    } catch (e) {
      toast.error('Erreur réseau');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Supprimer définitivement"
        className="p-1.5 hover:bg-red-50 rounded text-red-500 hover:text-red-700 transition"
      >
        <Trash2 className="w-4 h-4" />
      </button>

      {open && (
        <div
          role="presentation"
          onKeyDown={(e) => { if (e.key === "Escape") setOpen(false); }}
          className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/50"
          onClick={() => !loading && setOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-6 h-6 text-red-600" />
              </div>
              <div className="flex-1">
                <h3 className="font-bold text-lg mb-1">Supprimer {userName}</h3>
                <p className="text-sm text-slate-600">
                  Cette action est irréversible. L'utilisateur sera définitivement supprimé.
                </p>
              </div>
              <button
                onClick={() => setOpen(false)}
                disabled={loading}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Files option */}
            {resourcesCount > 0 && (
              <div className="bg-slate-50 rounded-xl p-4 mb-4">
                <div className="flex items-center gap-2 mb-3 text-sm font-semibold text-slate-700">
                  <FileText className="w-4 h-4" />
                  {resourcesCount} fichier{resourcesCount > 1 ? 's' : ''} de cet utilisateur
                </div>

                <div className="space-y-2">
                  <label
                    className={`flex items-start gap-3 p-3 rounded-lg cursor-pointer border-2 transition ${keepFiles ? 'border-primary-400 bg-primary-50' : 'border-slate-200 hover:border-slate-300'}`}
                    aria-label={keepFiles ? 'Garder les fichiers' : 'Supprimer les fichiers'}
                  >
                    <input
                      type="radio"
                      name="files-option"
                      checked={!keepFiles}
                      onChange={() => setKeepFiles(false)}
                      className="mt-1"
                    />
                    <div className="flex-1">
                      <div className="font-semibold text-sm flex items-center gap-2">
                        🗑️ Supprimer aussi les fichiers
                      </div>
                      <div className="text-xs text-slate-500 mt-1">
                        Action définitive. Toutes les ressources ({resourcesCount}) seront
                        supprimées du stockage.
                      </div>
                    </div>
                  </label>

                  <label
                    className={`flex items-start gap-3 p-3 rounded-lg cursor-pointer border-2 transition ${keepFiles ? 'border-primary-400 bg-primary-50' : 'border-slate-200 hover:border-slate-300'}`}
                    aria-label={keepFiles ? 'Garder les fichiers' : 'Supprimer les fichiers'}
                  >
                    <input
                      type="radio"
                      name="files-option"
                      checked={keepFiles}
                      onChange={() => setKeepFiles(true)}
                      className="mt-1"
                    />
                    <div className="flex-1">
                      <div className="font-semibold text-sm flex items-center gap-2">
                        <FolderOpen className="w-4 h-4" />
                        Conserver les fichiers (recommandé)
                      </div>
                      <div className="text-xs text-slate-500 mt-1">
                        Les {resourcesCount} ressource(s) seront transférées à votre compte admin et
                        resteront visibles publiquement.
                      </div>
                    </div>
                  </label>
                </div>
              </div>
            )}

            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4">
              <p className="text-xs text-amber-800">
                ⚠️ Pour confirmer, tape <strong className="font-mono">SUPPRIMER</strong> en
                majuscules :
              </p>
            </div>

            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="SUPPRIMER"
              className="input mb-4 font-mono"
              autoComplete="off"
            />

            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setOpen(false)}
                disabled={loading}
                className="px-4 py-2 border border-slate-200 rounded-xl hover:bg-slate-50 font-semibold text-sm"
              >
                Annuler
              </button>
              <button
                onClick={handleDelete}
                disabled={loading || confirmText !== 'SUPPRIMER'}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl font-semibold text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Trash2 className="w-4 h-4" />
                )}
                Supprimer
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
