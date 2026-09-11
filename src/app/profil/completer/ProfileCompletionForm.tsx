'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { GraduationCap, School, MapPin, User } from 'lucide-react';

export default function ProfileCompletionForm({
  initialFirstName,
  initialLastName,
  initialEmail,
  initialSchoolLevel,
  initialClassLevel,
  initialSchoolName,
  initialGovernorate,
}: {
  initialFirstName: string;
  initialLastName: string;
  initialEmail: string;
  initialSchoolLevel: string;
  initialClassLevel: string;
  initialSchoolName: string;
  initialGovernorate: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    firstName: initialFirstName,
    lastName: initialLastName,
    schoolLevel: initialSchoolLevel,
    classLevel: initialClassLevel,
    schoolName: initialSchoolName,
    governorate: initialGovernorate,
  });

  const TUNISIA_GOVERNORATES = [
    'Ariana', 'Béja', 'Ben Arous', 'Bizerte', 'Gabès', 'Gafsa', 'Jendouba',
    'Kairouan', 'Kasserine', 'Kébili', 'Kef', 'Mahdia', 'Manouba', 'Médenine',
    'Monastir', 'Nabeul', 'Sfax', 'Sidi Bouzid', 'Siliana', 'Sousse',
    'Tataouine', 'Tozeur', 'Tunis', 'Zaghouan',
  ];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/profile/update', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const d = await res.json();
        setError(d.error || 'Erreur');
        return;
      }
      const data = await res.json();

      // 2026-09-11: For teachers who just completed profile after OTP,
      // the server auto-triggers the 5-file verification request.
      // Redirect them directly to the upload page.
      if (data.nextStep === 'file_verification') {
        toast.success(
          data.emailSent
            ? '✅ Profil complet ! Email envoyé pour demander les 5 fichiers.'
            : '✅ Profil complet ! Vous pouvez envoyer vos 5 fichiers.',
        );
        router.push('/enseignant/verification');
      } else {
        router.push('/');
      }
      router.refresh();
    } catch (e: any) {
      setError(e.message || 'Erreur');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Prénom</label>
          <div className="relative">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={form.firstName}
              onChange={(e) => setForm({ ...form, firstName: e.target.value })}
              required
              className="w-full pl-10 pr-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-sky-500 outline-none"
            />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Nom</label>
          <input
            type="text"
            value={form.lastName}
            onChange={(e) => setForm({ ...form, lastName: e.target.value })}
            required
            className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-sky-500 outline-none"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
        <input
          type="email"
          value={initialEmail}
          disabled
          className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-slate-50 text-slate-500"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Niveau</label>
          <div className="relative">
            <GraduationCap className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <select
              value={form.schoolLevel}
              onChange={(e) => setForm({ ...form, schoolLevel: e.target.value, classLevel: '' })}
              className="w-full pl-10 pr-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-sky-500 outline-none"
            >
              <option value="">Choisir...</option>
              <option value="COLLEGE">Collège</option>
              <option value="LYCEE">Lycée</option>
            </select>
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Classe</label>
          <select
            value={form.classLevel}
            onChange={(e) => setForm({ ...form, classLevel: e.target.value })}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-sky-500 outline-none"
          >
            <option value="">Choisir...</option>
            {form.schoolLevel === 'COLLEGE' && (
              <>
                <option value="7EME">7ème année</option>
                <option value="8EME">8ème année</option>
                <option value="9EME">9ème année</option>
              </>
            )}
            {form.schoolLevel === 'LYCEE' && (
              <>
                <option value="1AS">1ère année</option>
                <option value="2AS">2ème année</option>
                <option value="3AS">3ème année</option>
                <option value="4AS">4ème année (Bac)</option>
              </>
            )}
          </select>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Établissement</label>
        <div className="relative">
          <School className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={form.schoolName}
            onChange={(e) => setForm({ ...form, schoolName: e.target.value })}
            placeholder="Lycée, collège..."
            className="w-full pl-10 pr-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-sky-500 outline-none"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Gouvernorat</label>
        <div className="relative">
          <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <select
            value={form.governorate}
            onChange={(e) => setForm({ ...form, governorate: e.target.value })}
            className="w-full pl-10 pr-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-sky-500 outline-none"
          >
            <option value="">Choisir...</option>
            {TUNISIA_GOVERNORATES.map((g) => (
              <option key={g} value={g}>{g}</option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <div className="text-sm text-red-600 bg-red-50 p-3 rounded-lg">{error}</div>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full py-2.5 bg-sky-600 hover:bg-sky-700 disabled:bg-slate-300 text-white rounded-lg font-semibold transition"
      >
        {loading ? 'Enregistrement...' : 'Terminer mon inscription'}
      </button>

      <button
        type="button"
        onClick={() => router.push('/')}
        className="w-full py-2 text-slate-500 hover:text-slate-700 text-sm"
      >
        Plus tard
      </button>
    </form>
  );
}
