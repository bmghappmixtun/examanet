'use client';
import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  GraduationCap,
  Eye,
  EyeOff,
  ArrowLeft,
  Mail,
  KeyRound,
  CheckCircle2,
  Loader2,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useTranslations } from 'next-intl';

type Step = 'email' | 'code' | 'done';

export default function ForgotPasswordPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useTranslations();

  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState(searchParams.get('email') || '');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [devCode, setDevCode] = useState<string | null>(null);
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Cooldown timer for resend
  useEffect(() => {
    if (cooldown <= 0) {
      if (cooldownRef.current) {
        clearInterval(cooldownRef.current);
        cooldownRef.current = null;
      }
      return;
    }
    cooldownRef.current = setInterval(() => {
      setCooldown((c) => Math.max(0, c - 1));
    }, 1000);
    return () => {
      if (cooldownRef.current) clearInterval(cooldownRef.current);
    };
  }, [cooldown]);

  // Step 1: send code
  async function requestCode(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return;
    setLoading(true);
    try {
      const res = await fetch('/api/password/forgot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || t('common.error'));
        return;
      }
      if (data.devCode) setDevCode(data.devCode);
      toast.success(t('auth.codeSent') || 'Code envoyé !');
      setStep('code');
      setCooldown(60); // 60s before allowing resend
    } catch {
      toast.error(t('common.error'));
    } finally {
      setLoading(false);
    }
  }

  // Resend code
  async function resendCode() {
    if (cooldown > 0 || resending) return;
    setResending(true);
    try {
      const res = await fetch('/api/password/forgot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || t('common.error'));
        return;
      }
      if (data.devCode) setDevCode(data.devCode);
      toast.success(t('auth.codeSent') || 'Code renvoyé !');
      setCooldown(60);
    } catch {
      toast.error(t('common.error'));
    } finally {
      setResending(false);
    }
  }

  // Step 2: verify code + set new password
  async function handleReset(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast.error('Les mots de passe ne correspondent pas');
      return;
    }
    if (newPassword.length < 8) {
      toast.error('Au moins 8 caractères');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/password/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || t('common.error'));
        return;
      }
      toast.success(t('auth.passwordReset') || 'Mot de passe réinitialisé !');
      setStep('done');
      setTimeout(() => router.push('/connexion'), 2000);
    } catch {
      toast.error(t('common.error'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 via-white to-sky-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2 mb-6">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center shadow-lg">
              <GraduationCap className="w-7 h-7 text-white" />
            </div>
          </Link>

          {step === 'email' && (
            <>
              <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-primary-100 flex items-center justify-center">
                <Mail className="w-7 h-7 text-primary-600" />
              </div>
              <h1 className="text-2xl font-extrabold">
                {t('auth.forgotPasswordTitle') || 'Mot de passe oublié ?'}
              </h1>
              <p className="text-slate-500 mt-1 text-sm">
                {t('auth.forgotPasswordSubtitle') ||
                  'Entrez votre email et nous vous enverrons un code pour réinitialiser votre mot de passe.'}
              </p>
            </>
          )}

          {step === 'code' && (
            <>
              <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-amber-100 flex items-center justify-center">
                <KeyRound className="w-7 h-7 text-amber-600" />
              </div>
              <h1 className="text-2xl font-extrabold">{t('auth.enterCode') || 'Entrez le code'}</h1>
              <p className="text-slate-500 mt-1 text-sm">
                {t('auth.codeSentTo') || 'Un code a été envoyé à'} <strong>{email}</strong>
              </p>
            </>
          )}

          {step === 'done' && (
            <>
              <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-emerald-100 flex items-center justify-center">
                <CheckCircle2 className="w-7 h-7 text-emerald-600" />
              </div>
              <h1 className="text-2xl font-extrabold">
                {t('auth.passwordReset') || 'Mot de passe réinitialisé !'}
              </h1>
              <p className="text-slate-500 mt-1 text-sm">
                {t('auth.redirectingToLogin') || 'Redirection vers la page de connexion...'}
              </p>
            </>
          )}
        </div>

        {step === 'email' && (
          <form
            onSubmit={requestCode}
            className="bg-white rounded-2xl p-6 lg:p-8 shadow-xl border border-slate-100"
          >
            <div className="mb-6">
              <label className="label">{t('auth.email') || 'Email'}</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="input"
                placeholder="votre@email.com"
              />
            </div>
            <button
              type="submit"
              disabled={loading || !email}
              className="btn-primary w-full justify-center py-3 text-base disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> ...
                </>
              ) : (
                t('auth.sendCode') || 'Envoyer le code'
              )}
            </button>
            <div className="mt-6 text-center text-sm text-slate-500">
              <Link
                href="/connexion"
                className="inline-flex items-center gap-1 text-primary-600 hover:underline font-semibold"
              >
                <ArrowLeft className="w-3 h-3" /> {t('auth.backToLogin') || 'Retour à la connexion'}
              </Link>
            </div>
          </form>
        )}

        {step === 'code' && (
          <form
            onSubmit={handleReset}
            className="bg-white rounded-2xl p-6 lg:p-8 shadow-xl border border-slate-100"
          >
            <div className="mb-4">
              <label className="label">{t('auth.code') || 'Code reçu'}</label>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                required
                className="input text-center text-2xl tracking-[0.5em] font-bold"
                placeholder="000000"
              />
              {devCode && (
                <p className="text-xs text-amber-600 mt-2 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" /> Dev mode: code is {devCode}
                </p>
              )}
              <button
                type="button"
                onClick={resendCode}
                disabled={cooldown > 0 || resending}
                className="mt-2 text-xs text-primary-600 hover:underline disabled:text-slate-400 disabled:no-underline inline-flex items-center gap-1"
              >
                <RefreshCw className={`w-3 h-3 ${resending ? 'animate-spin' : ''}`} />
                {cooldown > 0
                  ? `Renvoyer dans ${cooldown}s`
                  : t('auth.resendCode') || 'Renvoyer le code'}
              </button>
            </div>
            <div className="mb-4">
              <label className="label">{t('auth.newPassword') || 'Nouveau mot de passe'}</label>
              <div className="relative">
                <input
                  type={showPw ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  minLength={8}
                  className="input pr-10"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPw(!showPw)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div className="mb-6">
              <label className="label">
                {t('auth.confirmPassword') || 'Confirmer le mot de passe'}
              </label>
              <input
                type={showPw ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={8}
                className="input"
                placeholder="••••••••"
              />
            </div>
            <button
              type="submit"
              disabled={loading || code.length !== 6 || newPassword.length < 8}
              className="btn-primary w-full justify-center py-3 text-base disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> ...
                </>
              ) : (
                t('auth.resetPassword') || 'Réinitialiser le mot de passe'
              )}
            </button>
            <div className="mt-4 text-center text-sm text-slate-500">
              <button
                type="button"
                onClick={() => {
                  setStep('email');
                  setCode('');
                  setNewPassword('');
                  setConfirmPassword('');
                }}
                className="inline-flex items-center gap-1 text-slate-500 hover:text-slate-700"
              >
                <ArrowLeft className="w-3 h-3" /> {t('auth.changeEmail') || "Changer d'email"}
              </button>
            </div>
          </form>
        )}

        {step === 'done' && (
          <div className="bg-white rounded-2xl p-6 lg:p-8 shadow-xl border border-slate-100 text-center">
            <Link href="/connexion" className="btn-primary w-full justify-center py-3 text-base">
              {t('auth.loginButton') || 'Se connecter'}
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
