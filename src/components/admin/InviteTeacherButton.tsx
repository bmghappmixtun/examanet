'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { Send, Loader2, X, CheckCircle2, Mail, MessageSquarePlus } from 'lucide-react';

type Props = {
  teacherIds: string[];
  teacherCount: number;
  variant?: 'single' | 'bulk';
  onComplete?: () => void;
};

export default function InviteTeacherButton({
  teacherIds,
  teacherCount,
  variant = 'single',
  onComplete,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [customMessage, setCustomMessage] = useState('');
  const [results, setResults] = useState<any>(null);

  async function sendInvitations() {
    if (teacherIds.length === 0) {
      toast.error('Aucun professeur sélectionné');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/admin/invite-teacher', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teacherIds,
          customMessage: customMessage.trim() || undefined,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || 'Erreur');
        return;
      }

      setResults(data);
      if (data.success > 0) {
        toast.success(
          `✅ ${data.success} invitation${data.success > 1 ? 's' : ''} envoyée${data.success > 1 ? 's' : ''}`,
        );
      }
      if (data.failed > 0) {
        toast(`${data.failed} échec${data.failed > 1 ? 's' : ''}`, { icon: '⚠️' });
      }
      onComplete?.();
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur réseau');
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-sky-500 to-cyan-600 text-white text-sm font-semibold rounded-lg hover:from-sky-600 hover:to-cyan-700 transition shadow-sm"
        title={variant === 'bulk' ? `Inviter ${teacherCount} profs` : 'Inviter ce prof'}
      >
        <Mail className="w-3.5 h-3.5" />
        {variant === 'bulk' ? `Inviter ${teacherCount}` : 'Inviter'}
      </button>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 animate-in fade-in"
          role="presentation"
          onKeyDown={(e) => { if (e.key === "Escape") (e.currentTarget as HTMLDivElement)?.click(); }}
      onClick={() => !submitting && setOpen(false)}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto"
          role="dialog"
          aria-modal="true"
        onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-br from-sky-600 to-cyan-700 text-white p-6 rounded-t-2xl">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-xl font-extrabold flex items-center gap-2">
                <Mail className="w-5 h-5" />
                {variant === 'bulk'
                  ? `Inviter ${teacherCount} professeurs`
                  : 'Inviter ce professeur'}
              </h2>
              <p className="text-sky-100 text-sm mt-1">
                Un email d'activation sera envoyé à chaque prof avec un lien unique (valable 10
                jours).
              </p>
            </div>
            <button
              onClick={() => setOpen(false)}
              disabled={submitting}
              className="text-white/80 hover:text-white p-1"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-6">
          {!results ? (
            <>
              {/* Email template preview */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-5">
                <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                  📧 Aperçu de l'email
                </div>
                <div className="text-sm text-slate-700 space-y-2">
                  <div>
                    <strong>Objet :</strong>{' '}
                    <em>Vos [X] fichiers vous attendent sur Examanet 🎓</em>
                  </div>
                  <div>
                    <strong>Contenu :</strong> Présentation de la plateforme + vos avantages (stats,
                    édition, messagerie, visibilité) + lien d'activation personnalisé avec mot de
                    passe temporaire unique.
                  </div>
                </div>
              </div>

              {/* Custom message */}
              <div className="mb-5">
                <label htmlFor="customMessage" className="block text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
                  <MessageSquarePlus className="w-4 h-4 text-sky-500" />
                  Message personnalisé (optionnel)
                </label>
                <textarea id="customMessage"
                  value={customMessage}
                  onChange={(e) => setCustomMessage(e.target.value)}
                  rows={3}
                  maxLength={500}
                  placeholder="Ex: On a particulièrement aimé vos exercices de maths — hâte de vous avoir parmi nous !"
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none text-sm resize-none"
                />
                <div className="text-xs text-slate-400 mt-1 text-right">
                  {customMessage.length}/500
                </div>
              </div>

              {/* Warning */}
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-5 text-sm text-amber-800">
                <strong>⚠️ Action irréversible :</strong> chaque prof recevra un email contenant un
                mot de passe temporaire unique. Le compte sera verrouillé jusqu'à activation.
              </div>

              {/* Actions */}
              <div className="flex gap-3">
                <button
                  onClick={() => setOpen(false)}
                  disabled={submitting}
                  className="flex-1 px-4 py-3 border border-slate-300 text-slate-700 font-semibold rounded-xl hover:bg-slate-50 transition disabled:opacity-50"
                >
                  Annuler
                </button>
                <button
                  onClick={sendInvitations}
                  disabled={submitting}
                  className="flex-1 px-4 py-3 bg-gradient-to-r from-sky-600 to-cyan-600 hover:from-sky-700 hover:to-cyan-700 text-white font-bold rounded-xl transition shadow-md disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Envoi...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      Envoyer {teacherCount > 1 ? `${teacherCount} invitations` : "l'invitation"}
                    </>
                  )}
                </button>
              </div>
            </>
          ) : (
            <>
              {/* Results */}
              <div className="space-y-3 mb-5">
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="bg-emerald-50 rounded-xl p-3 border border-emerald-200">
                    <div className="text-2xl font-extrabold text-emerald-600">
                      {results.success}
                    </div>
                    <div className="text-xs text-emerald-700 font-semibold">Réussis</div>
                  </div>
                  <div className="bg-rose-50 rounded-xl p-3 border border-rose-200">
                    <div className="text-2xl font-extrabold text-rose-600">{results.failed}</div>
                    <div className="text-xs text-rose-700 font-semibold">Échecs</div>
                  </div>
                  <div className="bg-slate-50 rounded-xl p-3 border border-slate-200">
                    <div className="text-2xl font-extrabold text-slate-600">{results.total}</div>
                    <div className="text-xs text-slate-700 font-semibold">Total</div>
                  </div>
                </div>

                {results.results && results.results.filter((r: any) => !r.ok).length > 0 && (
                  <details className="bg-rose-50 border border-rose-200 rounded-xl p-3">
                    <summary className="font-semibold text-sm text-rose-800 cursor-pointer">
                      Voir les {results.results.filter((r: any) => !r.ok).length} échec
                      {results.results.filter((r: any) => !r.ok).length > 1 ? 's' : ''}
                    </summary>
                    <div className="mt-2 space-y-1 text-xs text-rose-700 max-h-32 overflow-y-auto">
                      {results.results
                        .filter((r: any) => !r.ok)
                        .map((r: any) => (
                          <div key={r.teacherId}>
                            • {r.teacherName} ({r.email}): {r.error}
                          </div>
                        ))}
                    </div>
                  </details>
                )}
              </div>

              <button
                onClick={() => {
                  setOpen(false);
                  setResults(null);
                }}
                className="w-full px-4 py-3 bg-sky-600 text-white font-bold rounded-xl hover:bg-sky-700 transition flex items-center justify-center gap-2"
              >
                <CheckCircle2 className="w-4 h-4" />
                Terminé
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
