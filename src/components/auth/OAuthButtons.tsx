'use client';
import { signIn } from 'next-auth/react';
import { useState, useEffect } from 'react';
import { Mail, Link2, CheckCircle2 } from 'lucide-react';

export default function OAuthButtons({
  callbackUrl = '/',
  mode = 'login',
}: {
  callbackUrl?: string;
  mode?: string;
}) {
  const [showEmailInput, setShowEmailInput] = useState(false);
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [availableProviders, setAvailableProviders] = useState<{
    providers: string[];
    magicLink: boolean;
  } | null>(null);

  useEffect(() => {
    fetch('/api/auth/providers')
      .then((r) => r.json())
      .then((d) => setAvailableProviders(d))
      .catch(() => setAvailableProviders({ providers: [], magicLink: true }));
  }, []);

  async function handleOAuth(provider: string) {
    try {
      await signIn(provider, { callbackUrl });
    } catch (e: any) {
      console.error(`[OAuth] ${provider} error:`, e);
      setError(`Connexion ${provider} indisponible pour le moment. Réessayez ou utilisez le lien magique.`);
    }
  }

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/magic-link/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          role: mode === 'register' ? 'STUDENT' : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Erreur');
        return;
      }
      setSent(true);
      if (data.devLink) {
        console.log('[DEV] Magic link:', data.devLink);
      }
    } catch (e: any) {
      setError(e.message || 'Erreur réseau');
    } finally {
      setLoading(false);
    }
  }

  const showGoogle = availableProviders?.providers.includes('google') ?? false;
  const showFacebook = availableProviders?.providers.includes('facebook') ?? false;
  const showApple = availableProviders?.providers.includes('apple') ?? false;
  const hasOAuth = showGoogle || showFacebook || showApple;
  const showMagicLink = availableProviders?.magicLink ?? true;

  return (
    <div className="space-y-3">
      {hasOAuth && (
        <>
          <div className="relative my-4">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-200" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-white px-3 text-slate-500">ou continuer avec</span>
            </div>
          </div>

          <div className={`grid gap-2 ${showGoogle && showFacebook && showApple ? 'grid-cols-3' : (showGoogle && showFacebook) || (showGoogle && showApple) || (showFacebook && showApple) ? 'grid-cols-2' : 'grid-cols-1'}`}>
            {showGoogle && (
              <button
                type="button"
                onClick={() => handleOAuth('google')}
                className="flex items-center justify-center gap-2 px-3 py-2.5 border border-slate-200 rounded-xl hover:bg-slate-50 hover:border-slate-300 transition text-sm font-semibold"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
                Google
              </button>
            )}
            {showFacebook && (
              <button
                type="button"
                onClick={() => handleOAuth('facebook')}
                className="flex items-center justify-center gap-2 px-3 py-2.5 border border-slate-200 rounded-xl hover:bg-blue-50 hover:border-blue-300 transition text-sm font-semibold"
              >
                <svg className="w-4 h-4 text-blue-600" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M22 12c0-5.523-4.477-10-10-10S2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.878v-6.987h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.988C18.343 21.128 22 16.991 22 12z" />
                </svg>
                Facebook
              </button>
            )}
            {showApple && (
              <button
                type="button"
                onClick={() => handleOAuth('apple')}
                className="flex items-center justify-center gap-2 px-3 py-2.5 border border-slate-200 rounded-xl hover:bg-slate-100 transition text-sm font-semibold"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
                </svg>
                Apple
              </button>
            )}
          </div>
        </>
      )}

      {/* Magic link (always works, no setup needed) */}
      {showMagicLink && (
        <div className="mt-4 pt-4 border-t border-slate-100">
          {!showEmailInput && !sent && (
            <button
              type="button"
              onClick={() => setShowEmailInput(true)}
              className="w-full flex items-center justify-center gap-2 px-3 py-2.5 bg-sky-50 border border-sky-200 rounded-xl hover:bg-sky-100 transition text-sm font-semibold text-sky-700"
            >
              <Link2 className="w-4 h-4" />
              {mode === 'register' ? 'Créer un compte avec un lien email' : 'Recevoir un lien de connexion par email'}
            </button>
          )}

          {showEmailInput && !sent && (
            <form onSubmit={handleMagicLink} className="space-y-2">
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="votre@email.com"
                  required
                  autoComplete="email"
                  className="w-full pl-10 pr-3 py-2.5 border border-sky-200 rounded-xl focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none text-sm"
                />
              </div>
              <button
                type="submit"
                disabled={loading || !email}
                className="w-full flex items-center justify-center gap-2 px-3 py-2.5 bg-sky-600 hover:bg-sky-700 disabled:bg-slate-300 text-white rounded-xl transition text-sm font-semibold"
              >
                {loading ? 'Envoi...' : "M'envoyer le lien"}
              </button>
              {error && (
                <p className="text-xs text-red-600 mt-1">{error}</p>
              )}
            </form>
          )}

          {sent && (
            <div className="flex flex-col items-center gap-2 p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
              <CheckCircle2 className="w-6 h-6 text-emerald-600" />
              <p className="text-sm text-emerald-800 text-center font-semibold">
                {mode === 'register' ? 'Lien de bienvenue envoyé !' : 'Email envoyé !'}
              </p>
              <p className="text-xs text-emerald-700 text-center">
                Vérifiez votre boîte mail et cliquez sur le lien pour {mode === 'register' ? 'créer votre compte' : 'vous connecter'}.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
