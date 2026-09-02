'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  GraduationCap,
  Lock,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  ArrowRight,
  Sparkles,
  Mail,
  Clock,
} from 'lucide-react';

type InvitationInfo = {
  valid: boolean;
  teacherName?: string;
  teacherEmail?: string;
  fileCount?: number;
  status?: string;
  expiresAt?: string;
  alreadyActivated?: boolean;
  expired?: boolean;
  cancelled?: boolean;
  notFound?: boolean;
};

export default function AcceptInvitationClient({ token }: { token: string }) {
  const router = useRouter();
  const [info, setInfo] = useState<InvitationInfo | null>(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/invitation/${token}`, {
      headers: { 'x-invitation-token': token },
    })
      .then((r) => r.json())
      .then(setInfo)
      .catch(() => setInfo({ valid: false }));
  }, [token]);

  // Record click as soon as the page loads (via the GET endpoint)
  useEffect(() => {
    fetch(`/api/invitation/${token}/track`, {
      method: 'POST',
    }).catch(() => {});
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError('Le mot de passe doit contenir au moins 8 caractères');
      return;
    }
    if (password !== confirm) {
      setError('Les deux mots de passe ne correspondent pas');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/invitation/${token}/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setError(data.error || "Erreur lors de l'activation");
        setSubmitting(false);
        return;
      }

      // Success: server has set session cookie, just redirect
      router.push('/enseignant?welcome=1');
    } catch (e: any) {
      setError(e?.message || 'Erreur réseau');
      setSubmitting(false);
    }
  }

  if (!info) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-sky-50 to-cyan-50">
        <Loader2 className="w-8 h-8 text-sky-600 animate-spin" />
      </div>
    );
  }

  // === STATES ===

  if (info.notFound) {
    return (
      <CenteredMessage
        icon={<AlertTriangle className="w-12 h-12 text-amber-500" />}
        title="Invitation introuvable"
        message="Ce lien d'activation n'existe pas ou a été supprimé."
        cta={
          <Link href="/contact" className="text-sky-600 underline">
            Contacter le support
          </Link>
        }
      />
    );
  }

  if (info.alreadyActivated) {
    return (
      <CenteredMessage
        icon={<CheckCircle2 className="w-12 h-12 text-emerald-500" />}
        title="Compte déjà activé"
        message={`Le compte ${info.teacherEmail ? `(${info.teacherEmail}) ` : ''}a déjà été activé. Vous pouvez vous connecter.`}
        cta={
          <Link
            href="/connexion"
            className="inline-flex items-center gap-2 bg-sky-600 text-white px-6 py-3 rounded-xl font-semibold hover:bg-sky-700 transition"
          >
            Se connecter <ArrowRight className="w-4 h-4" />
          </Link>
        }
      />
    );
  }

  if (info.expired) {
    return (
      <CenteredMessage
        icon={<Clock className="w-12 h-12 text-rose-500" />}
        title="Invitation expirée"
        message="Ce lien d'activation a expiré (10 jours). Contactez-nous pour recevoir une nouvelle invitation."
        cta={
          <Link
            href="/contact"
            className="inline-flex items-center gap-2 bg-sky-600 text-white px-6 py-3 rounded-xl font-semibold hover:bg-sky-700 transition"
          >
            Demander une nouvelle invitation
          </Link>
        }
      />
    );
  }

  if (info.cancelled) {
    return (
      <CenteredMessage
        icon={<AlertTriangle className="w-12 h-12 text-rose-500" />}
        title="Invitation annulée"
        message="Cette invitation a été annulée par l'administrateur."
        cta={
          <Link href="/contact" className="text-sky-600 underline">
            Contacter le support
          </Link>
        }
      />
    );
  }

  // === MAIN FLOW ===

  const expiresAt = info.expiresAt ? new Date(info.expiresAt) : null;
  const daysLeft = expiresAt
    ? Math.max(0, Math.ceil((expiresAt.getTime() - Date.now()) / (24 * 3600 * 1000)))
    : 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 via-white to-cyan-50 flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        {/* Logo */}
        <Link href="/" className="flex items-center justify-center gap-2 mb-8">
          <div className="w-12 h-12 bg-gradient-to-br from-sky-500 to-cyan-600 rounded-xl flex items-center justify-center">
            <GraduationCap className="w-7 h-7 text-white" />
          </div>
          <span className="font-extrabold text-2xl text-slate-900">Examanet</span>
        </Link>

        <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
          {/* Header gradient */}
          <div className="bg-gradient-to-br from-sky-600 to-cyan-700 p-8 text-white text-center">
            <div className="inline-flex items-center gap-2 bg-white/20 px-3 py-1 rounded-full text-xs font-semibold mb-3">
              <Sparkles className="w-3 h-3" />
              ACTIVATION DE COMPTE
            </div>
            <h1 className="text-2xl md:text-3xl font-extrabold mb-2">
              Bienvenue {info.teacherName?.split(' ')[0] || ''} 🎉
            </h1>
            <p className="text-sky-100 text-sm">
              Définissez votre mot de passe pour accéder à vos {info.fileCount || 0} fichiers
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="p-8">
            {/* Account summary */}
            <div className="bg-slate-50 rounded-xl p-4 mb-6 border border-slate-100">
              <div className="flex items-center gap-3 text-sm">
                <Mail className="w-4 h-4 text-slate-400" />
                <span className="text-slate-600">Compte à activer :</span>
                <span className="font-semibold text-slate-900 truncate">{info.teacherEmail}</span>
              </div>
              {daysLeft > 0 && (
                <div className="flex items-center gap-3 text-sm mt-2">
                  <Clock className="w-4 h-4 text-amber-500" />
                  <span className="text-slate-600">Expire dans</span>
                  <span className="font-semibold text-amber-700">
                    {daysLeft} jour{daysLeft > 1 ? 's' : ''}
                  </span>
                </div>
              )}
            </div>

            {/* Password field */}
            <div className="mb-4">
              <label htmlFor="newPassword" className="block text-sm font-semibold text-slate-700 mb-2">
                Nouveau mot de passe
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-12 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none transition"
                  placeholder="Min. 8 caractères"
                  autoComplete="new-password"
                  required
                  disabled={submitting}
                  minLength={8}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Confirm password */}
            <div className="mb-6">
              <label htmlFor="confirmPassword" className="block text-sm font-semibold text-slate-700 mb-2">
                Confirmer le mot de passe
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none transition"
                  placeholder="Retapez le mot de passe"
                  autoComplete="new-password"
                  required
                  disabled={submitting}
                  minLength={8}
                />
              </div>
            </div>

            {/* Password strength hint */}
            {password && (
              <div className="mb-6 space-y-1">
                <PasswordRule ok={password.length >= 8} label="Au moins 8 caractères" />
                <PasswordRule ok={/[A-Z]/.test(password)} label="Une majuscule" />
                <PasswordRule ok={/[0-9]/.test(password)} label="Un chiffre" />
              </div>
            )}

            {error && (
              <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 mb-6 flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-rose-500 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-rose-700">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={submitting || !password || !confirm}
              className="w-full bg-gradient-to-r from-sky-600 to-cyan-600 hover:from-sky-700 hover:to-cyan-700 text-white font-bold py-4 rounded-xl transition shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Activation en cours...
                </>
              ) : (
                <>
                  Activer mon compte
                  <ArrowRight className="w-5 h-5" />
                </>
              )}
            </button>

            <p className="text-xs text-slate-500 text-center mt-4">
              En activant votre compte, vous acceptez nos{' '}
              <Link href="/cgu" className="underline">
                CGU
              </Link>{' '}
              et notre{' '}
              <Link href="/confidentialite" className="underline">
                politique de confidentialité
              </Link>
              .
            </p>
          </form>
        </div>

        {/* Login fallback */}
        <div className="text-center mt-6 text-sm text-slate-600">
          Vous avez déjà activé votre compte ?{' '}
          <Link href="/connexion" className="text-sky-600 font-semibold hover:underline">
            Se connecter
          </Link>
        </div>
      </div>
    </div>
  );
}

function PasswordRule({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div
      className={`text-xs flex items-center gap-2 ${ok ? 'text-emerald-600' : 'text-slate-500'}`}
    >
      <div
        className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold ${ok ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-400'}`}
      >
        {ok ? '✓' : '·'}
      </div>
      {label}
    </div>
  );
}

function CenteredMessage({
  icon,
  title,
  message,
  cta,
}: {
  icon: React.ReactNode;
  title: string;
  message: string;
  cta?: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-sky-50 to-cyan-50 p-6">
      <div className="bg-white rounded-2xl shadow-xl border border-slate-200 p-10 max-w-md w-full text-center">
        <div className="flex justify-center mb-4">{icon}</div>
        <h1 className="text-2xl font-extrabold text-slate-900 mb-3">{title}</h1>
        <p className="text-slate-600 mb-6">{message}</p>
        {cta}
      </div>
    </div>
  );
}
