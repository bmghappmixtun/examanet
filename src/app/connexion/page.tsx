'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { GraduationCap, Eye, EyeOff } from 'lucide-react';
import toast from 'react-hot-toast';
import { useTranslations } from 'next-intl';
import OAuthButtons from '@/components/auth/OAuthButtons';

export default function LoginPage() {
  const router = useRouter();
  const t = useTranslations('auth');
  const tCommon = useTranslations('common');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        // Special handling: redirect to OTP verification if account is pending
        if (data.code === 'PENDING_OTP' && data.email) {
          toast.error(data.error || t('invalidCredentials'));
          router.push(`/verifier?email=${encodeURIComponent(data.email)}`);
          return;
        }
        if (data.code === 'PENDING_APPROVAL') {
          toast.error(data.error || t('invalidCredentials'));
          router.push('/en-attente');
          return;
        }
        toast.error(data.error || t('invalidCredentials'));
        return;
      }
      toast.success('Bienvenue ! 🎉');
      if (data.user.role === 'ADMIN') router.push('/admin');
      else if (data.user.role === 'TEACHER') router.push('/enseignant');
      else router.push('/mon-compte');
    } catch {
      toast.error(tCommon('error'));
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
          <h1 className="text-2xl font-extrabold">{t('loginTitle')}</h1>
          <p className="text-slate-500 mt-1">{t('loginSubtitle')}</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-white rounded-2xl p-6 lg:p-8 shadow-xl border border-slate-100"
        >
          <div className="mb-4">
            <label className="label">{t('email')}</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="input"
              placeholder="votre@email.com"
            />
          </div>
          <div className="mb-6">
            <label className="label">{t('password')}</label>
            <div className="relative">
              <input
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
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
          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full justify-center py-3 text-base"
          >
            {loading ? '...' : t('loginButton')}
          </button>

          <OAuthButtons />

          <div className="text-center mt-4">
            <Link href="/mot-de-passe-oublie" className="text-sm text-primary-600 hover:underline">
              {t('forgotPassword')}
            </Link>
          </div>
        </form>

        <p className="text-center mt-6 text-sm text-slate-500">
          {t('noAccount')}{' '}
          <Link href="/inscription" className="text-primary-600 font-semibold hover:underline">
            {t('signupNow')}
          </Link>
        </p>
      </div>
    </div>
  );
}
