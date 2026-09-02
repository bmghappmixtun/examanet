'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Save,
  Loader2,
  User,
  BookOpen,
  Layers,
  MapPin,
  Briefcase,
  GraduationCap,
  Globe,
  Phone,
  Image as ImageIcon,
} from 'lucide-react';
import toast from 'react-hot-toast';

const GOVERNORATES = [
  'Tunis',
  'Ariana',
  'Ben Arous',
  'Manouba',
  'Nabeul',
  'Zaghouan',
  'Bizerte',
  'Béja',
  'Jendouba',
  'Kef',
  'Siliana',
  'Sousse',
  'Monastir',
  'Mahdia',
  'Sfax',
  'Kairouan',
  'Kasserine',
  'Sidi Bouzid',
  'Gabès',
  'Médenine',
  'Tataouine',
  'Gafsa',
  'Tozeur',
  'Kebili',
];

const DIPLOMAS = [
  'Licence',
  'Master',
  'Doctorat',
  'Ingénieur',
  'Professeure principale',
  'Professeur secondaire',
  'Maître de conférences',
  'Agrégé',
  'Autres',
];

const COMMON_SUBJECTS = [
  'Mathématiques',
  'Physique',
  'Sciences',
  'Arabe',
  'Français',
  'Anglais',
  'Histoire',
  'Géographie',
  'Philosophie',
  'Économie',
  'Gestion',
  'Informatique',
  'Technologie',
  'Sport',
  'Musique',
  'Dessin',
  'Biologie',
  'Chimie',
];

const COMMON_LEVELS = [
  'Collège',
  'Lycée',
  'Bac',
  '7ème année',
  '8ème année',
  '9ème année',
  '1ère année secondaire',
  '2ème année secondaire',
  '3ème année secondaire',
  '4ème année secondaire',
];

export default function EditProfilePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState<any>(null);

  useEffect(() => {
    fetch('/api/teacher/profile')
      .then((r) => r.json())
      .then((data) => {
        // Parse JSON arrays for editing
        const parseArr = (val: string | null): string[] => {
          if (!val) return [];
          try {
            return JSON.parse(val);
          } catch {
            return [];
          }
        };
        setProfile({
          ...data,
          teachingSubjects: parseArr(data.teachingSubjects),
          teachingLevels: parseArr(data.teachingLevels),
        });
        setLoading(false);
      })
      .catch(() => {
        toast.error('Erreur de chargement');
        setLoading(false);
      });
  }, []);

  function toggleArr(field: 'teachingSubjects' | 'teachingLevels', value: string) {
    setProfile((p: any) => ({
      ...p,
      [field]: p[field].includes(value)
        ? p[field].filter((v: string) => v !== value)
        : [...p[field], value],
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch('/api/teacher/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profile),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Erreur');
        return;
      }
      toast.success('✅ Profil mis à jour !');
      router.refresh();
    } catch {
      toast.error('Erreur réseau');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 gap-2 text-slate-500">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span>Chargement...</span>
      </div>
    );
  }

  if (!profile) {
    return <div className="p-8 text-center text-red-500">Impossible de charger le profil</div>;
  }

  return (
    <div>
      <h1 className="text-2xl font-extrabold mb-6 flex items-center gap-2">
        <User className="w-7 h-7 text-primary-500" />
        Mon profil enseignant
      </h1>

      <form onSubmit={handleSubmit} className="max-w-3xl space-y-6">
        {/* Avatar & basic */}
        <div className="bg-white rounded-2xl border border-slate-100 p-6 space-y-4">
          <h2 className="font-bold flex items-center gap-2">
            <ImageIcon className="w-5 h-5 text-primary-500" /> Apparence
          </h2>

          <div className="flex items-start gap-4">
            <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-amber-400 to-amber-600 text-white font-extrabold text-3xl flex items-center justify-center flex-shrink-0">
              {profile.firstName?.[0]}
              {profile.lastName?.[0]}
            </div>
            <div className="flex-1">
              <label htmlFor="avatarUrl" className="label">URL de l'avatar</label>
              <input
                type="url"
                id="avatarUrl"
                value={profile.avatarUrl || ''}
                onChange={(e) => setProfile({ ...profile, avatarUrl: e.target.value })}
                className="input"
                placeholder="https://..."
              />
              <p className="text-xs text-slate-500 mt-1">
                Colle l'URL d'une image (JPG, PNG, WebP)
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="firstName" className="label">Prénom (FR)</label>
              <input
                type="text"
                id="firstName" value={profile.firstName || ''}
                onChange={(e) => setProfile({ ...profile, firstName: e.target.value })}
                className="input"
              />
            </div>
            <div>
              <label htmlFor="lastName" className="label">Nom (FR)</label>
              <input
                type="text"
                id="lastName" value={profile.lastName || ''}
                onChange={(e) => setProfile({ ...profile, lastName: e.target.value })}
                className="input"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="firstNameAr" className="label" dir="rtl">
                الاسم (AR)
              </label>
              <input
                type="text"
                value={profile.firstNameAr || ''}
                onChange={(e) => setProfile({ ...profile, firstNameAr: e.target.value })}
                className="input"
                dir="rtl"
                placeholder="الاسم"
              />
            </div>
            <div>
              <label htmlFor="lastNameAr" className="label" dir="rtl">
                اللقب (AR)
              </label>
              <input
                type="text"
                value={profile.lastNameAr || ''}
                onChange={(e) => setProfile({ ...profile, lastNameAr: e.target.value })}
                className="input"
                dir="rtl"
                placeholder="اللقب"
              />
            </div>
          </div>
        </div>

        {/* Bio */}
        <div className="bg-white rounded-2xl border border-slate-100 p-6 space-y-4">
          <h2 className="font-bold flex items-center gap-2">
            <GraduationCap className="w-5 h-5 text-primary-500" /> Présentation
          </h2>
          <div>
            <label className="label">Bio ({profile.bio?.length || 0}/1000)</label>
            <textarea
              id="bio" value={profile.bio || ''}
              onChange={(e) => setProfile({ ...profile, bio: e.target.value })}
              maxLength={1000}
              className="input min-h-[120px] resize-none"
              placeholder="Présentez-vous aux élèves et parents : votre parcours, votre pédagogie, vos passions..."
            />
          </div>
        </div>

        {/* Location & work */}
        <div className="bg-white rounded-2xl border border-slate-100 p-6 space-y-4">
          <h2 className="font-bold flex items-center gap-2">
            <Briefcase className="w-5 h-5 text-primary-500" /> Établissement
          </h2>

          <div>
            <label htmlFor="schoolName" className="label">Nom de l'établissement</label>
            <input
              type="text"
              id="schoolName" value={profile.schoolName || ''}
              onChange={(e) => setProfile({ ...profile, schoolName: e.target.value })}
              className="input"
              placeholder="Ex: Lycée Bourguiba, Tunis"
            />
          </div>
          <div>
            <label htmlFor="schoolNameAr" className="label" dir="rtl">
              اسم المؤسسة بالعربية
            </label>
            <input
              type="text"
              value={profile.schoolNameAr || ''}
              onChange={(e) => setProfile({ ...profile, schoolNameAr: e.target.value })}
              className="input"
              dir="rtl"
              placeholder="مثال: المعهد الثانوي بورقيبة"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="bio" className="label flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5" /> Gouvernorat
              </label>
              <select
                value={profile.governorate || ''}
                onChange={(e) => setProfile({ ...profile, governorate: e.target.value })}
                className="input"
              >
                <option value="">— Choisir —</option>
                {GOVERNORATES.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="diploma" className="label">Diplôme</label>
              <select
                value={profile.diploma || ''}
                onChange={(e) => setProfile({ ...profile, diploma: e.target.value })}
                className="input"
              >
                <option value="">— Choisir —</option>
                {DIPLOMAS.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Teaching subjects & levels */}
        <div className="bg-white rounded-2xl border border-slate-100 p-6 space-y-4">
          <h2 className="font-bold flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-primary-500" /> Ce que j'enseigne
          </h2>

          <div>
            <label className="label">Matières enseignées ({profile.teachingSubjects.length})</label>
            <div className="flex flex-wrap gap-2">
              {COMMON_SUBJECTS.map((s) => {
                const selected = profile.teachingSubjects.includes(s);
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => toggleArr('teachingSubjects', s)}
                    className={`px-3 py-1.5 rounded-full text-sm font-semibold transition ${
                      selected
                        ? 'bg-primary-500 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {s}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label htmlFor="cvUrl" className="label flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5" /> Niveaux ({profile.teachingLevels.length})
            </label>
            <div className="flex flex-wrap gap-2">
              {COMMON_LEVELS.map((l) => {
                const selected = profile.teachingLevels.includes(l);
                return (
                  <button
                    key={l}
                    type="button"
                    onClick={() => toggleArr('teachingLevels', l)}
                    className={`px-3 py-1.5 rounded-full text-sm font-semibold transition ${
                      selected
                        ? 'bg-emerald-500 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {l}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Contact */}
        <div className="bg-white rounded-2xl border border-slate-100 p-6 space-y-4">
          <h2 className="font-bold flex items-center gap-2">
            <Globe className="w-5 h-5 text-primary-500" /> Contact
          </h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="bioAr" className="label flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5" /> Téléphone
              </label>
              <input
                type="tel"
                value={profile.phone || ''}
                onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                className="input"
                placeholder="+216 ..."
              />
            </div>
            <div>
              <label className="label flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5" /> Site web
              </label>
              <input
                type="url"
                value={profile.website || ''}
                onChange={(e) => setProfile({ ...profile, website: e.target.value })}
                className="input"
                placeholder="https://..."
              />
            </div>
          </div>
        </div>

        {/* Submit */}
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={() => router.back()}
            className="px-6 py-3 border border-slate-200 rounded-xl hover:bg-slate-50 font-semibold"
          >
            Annuler
          </button>
          <button type="submit" disabled={saving} className="btn-primary flex items-center gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Enregistrer
          </button>
        </div>
      </form>
    </div>
  );
}
