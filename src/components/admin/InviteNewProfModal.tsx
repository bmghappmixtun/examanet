'use client';

import { useState } from 'react';
import { X, Mail, User, Globe, MessageSquare, Loader2, Check, Send, UserPlus } from 'lucide-react';
import toast from 'react-hot-toast';

type Site = 'devoirat' | 'tunisiecollege';

interface InviteNewProfModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: (inv: any) => void;
}

export default function InviteNewProfModal({ open, onClose, onSuccess }: InviteNewProfModalProps) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [site, setSite] = useState<Site>('devoirat');
  const [customMessage, setCustomMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{
    acceptUrl: string;
    tempPassword: string;
    email: string;
    emailSent: boolean;
    emailError?: string;
  } | null>(null);

  const reset = () => {
    setFirstName('');
    setLastName('');
    setEmail('');
    setSite('devoirat');
    setCustomMessage('');
    setResult(null);
    setSubmitting(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim() || !email.trim()) {
      toast.error('Tous les champs sont obligatoires');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/admin/invite-new-teacher', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email: email.trim(),
          site,
          customMessage: customMessage.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Erreur lors de l\'envoi');
        return;
      }
      setResult({
        acceptUrl: data.acceptUrl,
        tempPassword: data.tempPassword,
        email: data.email,
        emailSent: data.emailSent,
        emailError: data.emailError,
      });
      toast.success('Invitation créée');
      onSuccess?.(data);
    } catch (err: any) {
      toast.error(`Erreur réseau: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="bg-gradient-to-r from-violet-600 to-fuchsia-600 px-6 py-5 flex items-center justify-between text-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
              <UserPlus className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold">Inviter un nouveau prof</h2>
              <p className="text-xs text-white/80">Email pro + lien d'activation automatique</p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="w-9 h-9 rounded-lg hover:bg-white/20 flex items-center justify-center transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Success state */}
        {result ? (
          <div className="p-6">
            <div className="flex items-center gap-3 mb-4 p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
              <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center">
                <Check className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <div className="font-bold text-emerald-900">Invitation envoyée avec succès</div>
                <div className="text-sm text-emerald-700">{result.email}</div>
              </div>
            </div>

            {result.emailSent ? (
              <div className="text-sm text-slate-600 mb-4">
                ✅ L'email a été envoyé via Resend. Le prof peut activer son compte en cliquant le lien.
              </div>
            ) : (
              <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4">
                ⚠️ Email non envoyé (mode dev ou erreur Resend).{' '}
                {result.emailError && <span className="text-xs">({result.emailError})</span>}
                <br />
                Partagez le lien manuellement.
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  🔗 Lien d'activation
                </label>
                <div className="mt-1 bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs font-mono text-slate-700 break-all">
                  {result.acceptUrl}
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  🔑 Mot de passe temporaire
                </label>
                <div className="mt-1 bg-slate-50 border border-slate-200 rounded-lg p-3 text-lg font-mono font-bold text-slate-900 text-center tracking-widest">
                  {result.tempPassword}
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  Le prof devra changer ce mot de passe lors de l'activation.
                </p>
              </div>
            </div>

            <div className="mt-6 flex gap-2">
              <button
                onClick={handleClose}
                className="flex-1 bg-slate-100 text-slate-700 py-2.5 rounded-xl font-semibold hover:bg-slate-200 transition-colors"
              >
                Fermer
              </button>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(`${result.acceptUrl}\n\nMot de passe: ${result.tempPassword}`);
                  toast.success('Copié !');
                }}
                className="flex-1 bg-violet-600 text-white py-2.5 rounded-xl font-semibold hover:bg-violet-700 transition-colors"
              >
                Copier le lien + MDP
              </button>
            </div>
          </div>
        ) : (
          /* Form */
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                  <User className="w-3.5 h-3.5 inline me-1" /> Prénom
                </label>
                <input
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="Mohamed"
                  required
                  disabled={submitting}
                  className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-violet-500 focus:border-transparent outline-none disabled:opacity-50"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                  <User className="w-3.5 h-3.5 inline me-1" /> Nom
                </label>
                <input
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Ben Salah"
                  required
                  disabled={submitting}
                  className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-violet-500 focus:border-transparent outline-none disabled:opacity-50"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                <Mail className="w-3.5 h-3.5 inline me-1" /> Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="prof@exemple.com"
                required
                disabled={submitting}
                className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-violet-500 focus:border-transparent outline-none disabled:opacity-50"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                <Globe className="w-3.5 h-3.5 inline me-1" /> Site d'origine
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setSite('devoirat')}
                  disabled={submitting}
                  className={`p-3 rounded-xl border-2 text-left transition-all ${
                    site === 'devoirat'
                      ? 'border-violet-500 bg-violet-50 shadow-md'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="font-bold text-slate-900 text-sm">devoirat.net</div>
                  <div className="text-xs text-slate-500 mt-0.5">Lycée · Bachillerato</div>
                </button>
                <button
                  type="button"
                  onClick={() => setSite('tunisiecollege')}
                  disabled={submitting}
                  className={`p-3 rounded-xl border-2 text-left transition-all ${
                    site === 'tunisiecollege'
                      ? 'border-fuchsia-500 bg-fuchsia-50 shadow-md'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="font-bold text-slate-900 text-sm">tunisiecollege.net</div>
                  <div className="text-xs text-slate-500 mt-0.5">Collège · 7-9ème</div>
                </button>
              </div>
              <p className="text-xs text-slate-500 mt-2">
                Détermine le ton et les exemples de l'email d'invitation.
              </p>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                <MessageSquare className="w-3.5 h-3.5 inline me-1" /> Message personnalisé{' '}
                <span className="text-slate-400 font-normal">(optionnel)</span>
              </label>
              <textarea
                value={customMessage}
                onChange={(e) => setCustomMessage(e.target.value)}
                placeholder="Ex: J'ai vu vos contrôles de 3ème maths, ils sont excellents..."
                rows={3}
                disabled={submitting}
                maxLength={1000}
                className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-violet-500 focus:border-transparent outline-none disabled:opacity-50 resize-none"
              />
              <div className="text-xs text-slate-400 text-right mt-1">
                {customMessage.length}/1000
              </div>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800">
              💡 <strong>Astuce :</strong> le prof doit déjà avoir partagé des ressources via Jotform.
              Sinon, l'email peut sembler incongru.
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={handleClose}
                disabled={submitting}
                className="flex-1 bg-slate-100 text-slate-700 py-2.5 rounded-xl font-semibold hover:bg-slate-200 transition-colors disabled:opacity-50"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="flex-1 bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white py-2.5 rounded-xl font-semibold hover:shadow-lg transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Envoi...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    Envoyer l'invitation
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
