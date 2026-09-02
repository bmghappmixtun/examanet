'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { GraduationCap, Eye, EyeOff } from 'lucide-react';
import toast from 'react-hot-toast';
import OAuthButtons from '@/components/auth/OAuthButtons';

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    email: '',
    password: '',
    firstName: '',
    lastName: '',
    role: 'STUDENT',
  });
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);

  function update(key: string, val: string) {
    setForm((prev) => ({ ...prev, [key]: val }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (form.password.length < 6) {
      toast.error('Mot de passe trop court');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error);
        return;
      }
      toast.success('Compte créé !');
      // Always go to OTP verification (both students and teachers)
      if (data.requiresVerification) {
        // Pass devCode in URL if available (so verifier page can show it)
        const params = new URLSearchParams({ email: form.email });
        if (data.devCode) params.set('devCode', data.devCode);
        router.push(`/verifier?${params.toString()}`);
      } else {
        router.push('/connexion');
      }
    } catch {
      toast.error('Erreur');
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
          <h1 className="text-2xl font-extrabold">Inscription gratuite</h1>
          <p className="text-slate-500 mt-1">Rejoignez +30 000 élèves et enseignants</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-white rounded-2xl p-6 lg:p-8 shadow-xl border border-slate-100"
        >
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label htmlFor="firstName" className="label">Prénom *</label>
              <input id="firstName" type="text" required value={form.firstName}
                autoComplete="given-name" inputMode="text"
                onChange={(e) => update('firstName', e.target.value)}
                className="input"
                placeholder="Prénom"
              />
            </div>
            <div>
              <label htmlFor="lastName" className="label">Nom *</label>
              <input id="lastName" type="text" value={form.lastName}
                autoComplete="family-name" inputMode="text"
                onChange={(e) => update('lastName', e.target.value)}
                className="input"
                placeholder="Nom"
              />
            </div>
          </div>
          <div className="mb-4">
            <label htmlFor="email" className="label">Email *</label>
            <input id="confirmPassword"
              type="email"
              required
              value={form.email}
              onChange={(e) => update('email', e.target.value)}
              className="input"
              placeholder="votre@email.com"
            />
          </div>
          <div className="mb-4">
            <label htmlFor="password" className="label">Mot de passe *</label>
            <div className="relative">
              <input id="confirmPassword"
                type={showPw ? 'text' : 'password'}
                required
                value={form.password}
                autoComplete="new-password" inputMode="text"
                onChange={(e) => update('password', e.target.value)}
                className="input pr-10"
                placeholder="Min. 6 caractères"
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
            <fieldset className="mb-6">
              <legend className="label mb-2">Vous êtes ?</legend>
              <div className="grid grid-cols-2 gap-2">
              {[
                { value: 'STUDENT', label: 'Élève', icon: '🎓' },
                { value: 'TEACHER', label: 'Enseignant', icon: '👨‍🏫' },
              ].map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => update('role', opt.value)}
                  className={`px-4 py-3 rounded-xl border-2 transition font-semibold text-sm ${
                    form.role === opt.value
                      ? 'border-primary-500 bg-primary-50 text-primary-700'
                      : 'border-slate-200 hover:border-slate-300 text-slate-600'
                  }`}
                >
                  <span className="text-xl block mb-1">{opt.icon}</span>
                  {opt.label}
                </button>
              ))}
            </div>
            </fieldset>

            {/* Teacher motivation banner */}
            {form.role === 'TEACHER' && (
              <div className="mt-4 p-4 rounded-xl bg-gradient-to-br from-amber-50 via-orange-50 to-yellow-50 border-2 border-amber-200">
                <div className="flex items-start gap-3">
                  <div className="text-3xl flex-shrink-0">👨‍🏫</div>
                  <div className="flex-1">
                    <h3 className="font-bold text-amber-900 mb-1">
                      Pourquoi devenir enseignant sur Examanet ?
                    </h3>
                    <p className="text-sm text-amber-800 mb-2">
                      En créant votre compte enseignant, vous débloquez :
                    </p>
                    <ul className="text-xs text-amber-900 space-y-1">
                      <li className="flex items-start gap-1.5">
                        <span className="text-amber-500">✓</span>
                        <span>
                          <strong>Bibliothèque personnelle</strong> — gardez vos fichiers Word
                          (.docx) originaux, jamais perdus
                        </span>
                      </li>
                      <li className="flex items-start gap-1.5">
                        <span className="text-amber-500">✓</span>
                        <span>
                          <strong>Conversion Word → PDF automatique</strong> pour publier en
                          quelques secondes
                        </span>
                      </li>
                      <li className="flex items-start gap-1.5">
                        <span className="text-amber-500">✓</span>
                        <span>
                          <strong>Téléchargement de l'original Office</strong> — sur chaque
                          ressource, accédez au fichier Word (.docx) source pour le modifier
                        </span>
                      </li>
                      <li className="flex items-start gap-1.5">
                        <span className="text-amber-500">✓</span>
                        <span>
                          <strong>Badge vérifié ✓</strong> une fois approuvé par notre équipe
                        </span>
                      </li>
                    </ul>
                    <p className="text-xs text-amber-700 mt-2 italic">
                      Les fichiers Word originaux ne sont accessibles qu'aux enseignants, jamais aux
                      élèves.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Student motivation banner */}
            {form.role === 'STUDENT' && (
              <div className="mt-4 p-4 rounded-xl bg-gradient-to-br from-sky-50 via-blue-50 to-cyan-50 border-2 border-sky-200">
                <div className="flex items-start gap-3">
                  <div className="text-3xl flex-shrink-0">🎓</div>
                  <div className="flex-1">
                    <h3 className="font-bold text-sky-900 mb-1">
                      Des milliers de ressources gratuites pour réussir !
                    </h3>
                    <ul className="text-xs text-sky-900 space-y-1">
                      <li className="flex items-start gap-1.5">
                        <span className="text-sky-500">✓</span>
                        <span>
                          <strong>+200 cours, devoirs, séries, examens</strong> dans toutes les
                          matières
                        </span>
                      </li>
                      <li className="flex items-start gap-1.5">
                        <span className="text-sky-500">✓</span>
                        <span>
                          <strong>Recherche multilingue</strong> (français + arabe)
                        </span>
                      </li>
                      <li className="flex items-start gap-1.5">
                        <span className="text-sky-500">✓</span>
                        <span>
                          <strong>100% gratuit</strong>, aucun paiement requis
                        </span>
                      </li>
                      <li className="flex items-start gap-1.5">
                        <span className="text-sky-500">✓</span>
                        <span>
                          <strong>Favoris</strong>, notes, commentaires pour organiser ton travail
                        </span>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
            )}
          </div>

          <button type="submit" disabled={loading} className="btn-primary w-full mb-4">
            {loading ? 'Création...' : 'Créer mon compte'}
          </button>

          <p className="text-xs text-slate-500 text-center mb-4">
            En vous inscrivant, vous acceptez nos{' '}
            <Link href="/cgu" className="text-primary-600 hover:underline">
              CGU
            </Link>
            .
          </p>

          <div className="relative my-4">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-200"></div>
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-white px-3 text-slate-500">ou</span>
            </div>
          </div>

          <OAuthButtons mode="register" />
        </form>

        <p className="text-center text-sm text-slate-500 mt-6">
          Vous avez déjà un compte ?{' '}
          <Link href="/connexion" className="text-primary-600 font-semibold hover:underline">
            Se connecter
          </Link>
        </p>
      </div>
    </div>
  );
}
