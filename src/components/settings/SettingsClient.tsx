'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  User,
  Lock,
  Mail,
  Bell,
  Palette,
  Trash2,
  Save,
  Loader2,
  BookOpen,
  Phone,
  Globe,
  Shield,
  Eye,
  EyeOff,
  Check,
} from 'lucide-react';
import toast from 'react-hot-toast';

type Account = {
  id: string;
  email: string;
  role: string;
  status: string;
  firstName: string | null;
  lastName: string | null;
  avatarUrl: string | null;
  bio: string | null;
  schoolName: string | null;
  governorate: string | null;
  diploma: string | null;
  teachingSubjects: string | null;
  teachingLevels: string | null;
  phone: string | null;
  website: string | null;
  preferredLang: string;
  themePref: string;
  notifyEmail: boolean;
  notifyInApp: boolean;
  createdAt: Date | string;
  lastLoginAt: Date | string | null;
  emailVerifiedAt: Date | string | null;
};

type Options = {
  subjects: { slug: string; nameFr: string; nameAr: string }[];
  classes: { slug: string; nameFr: string; nameAr: string; level: { nameFr: string } }[];
  levels: { slug: string; nameFr: string }[];
};

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
  'Professeur principal',
  'Professeur secondaire',
  'Agrégé',
  'Autres',
];

const LANGS = [
  { code: 'fr', label: 'Français' },
  { code: 'ar', label: 'العربية' },
];

const THEMES = [
  { code: 'light', label: '☀️ Clair' },
  { code: 'dark', label: '🌙 Sombre' },
  { code: 'auto', label: '🔄 Auto' },
];

export default function SettingsClient({
  account,
  options,
}: {
  account: Account;
  options: Options;
}) {
  const router = useRouter();
  const [section, setSection] = useState<string>('profile');
  const [saving, setSaving] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState({
    firstName: account.firstName || '',
    lastName: account.lastName || '',
    avatarUrl: account.avatarUrl || '',
    bio: account.bio || '',
    schoolName: account.schoolName || '',
    governorate: account.governorate || '',
    diploma: account.diploma || '',
    phone: account.phone || '',
    website: account.website || '',
    preferredLang: account.preferredLang || 'fr',
    themePref: account.themePref || 'light',
    notifyEmail: account.notifyEmail,
    notifyInApp: account.notifyInApp ?? true,
    teachingSubjects: account.teachingSubjects ? JSON.parse(account.teachingSubjects) : [],
    teachingLevels: account.teachingLevels ? JSON.parse(account.teachingLevels) : [],
  });

  const isTeacher = account.role === 'TEACHER';
  const isAdmin = account.role === 'ADMIN';

  // Sections de navigation
  const sections = [
    { id: 'profile', label: 'Profil', icon: User, roles: ['STUDENT', 'TEACHER', 'ADMIN'] },
    { id: 'security', label: 'Sécurité', icon: Lock, roles: ['STUDENT', 'TEACHER', 'ADMIN'] },
    ...(isTeacher || isAdmin
      ? [{ id: 'teaching', label: 'Enseignement', icon: BookOpen, roles: ['TEACHER', 'ADMIN'] }]
      : []),
    {
      id: 'notifications',
      label: 'Notifications',
      icon: Bell,
      roles: ['STUDENT', 'TEACHER', 'ADMIN'],
    },
    {
      id: 'preferences',
      label: 'Préférences',
      icon: Palette,
      roles: ['STUDENT', 'TEACHER', 'ADMIN'],
    },
    { id: 'account', label: 'Compte', icon: Shield, roles: ['STUDENT', 'TEACHER', 'ADMIN'] },
    ...(isAdmin ? [{ id: 'admin', label: 'Administration', icon: Shield, roles: ['ADMIN'] }] : []),
  ];

  async function save() {
    setSaving(true);
    try {
      const res = await fetch('/api/user/account', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Erreur');
        return;
      }
      toast.success('✅ Paramètres enregistrés');
      router.refresh();
    } catch {
      toast.error('Erreur réseau');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 pt-8 pb-12">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <h1 className="text-3xl font-extrabold mb-2">⚙️ Paramètres</h1>
        <p className="text-slate-600 mb-6">
          Gérez votre compte, sécurité, notifications et préférences
        </p>

        <div className="grid md:grid-cols-[240px_1fr] gap-6">
          {/* Sidebar */}
          <aside className="bg-white rounded-2xl border border-slate-200 p-2 h-fit md:sticky md:top-8">
            <nav className="space-y-1">
              {sections.map((s) => {
                const Icon = s.icon;
                const active = section === s.id;
                return (
                  <button
                    key={s.id}
                    onClick={() => setSection(s.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition ${
                      active
                        ? 'bg-primary-500 text-white shadow-md'
                        : 'text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {s.label}
                  </button>
                );
              })}
            </nav>
          </aside>

          {/* Content */}
          <main className="space-y-6">
            {/* PROFIL */}
            {section === 'profile' && (
              <SectionCard
                title="Profil"
                description="Informations visibles sur votre profil public"
                icon={User}
              >
                <div className="flex items-start gap-4">
                  <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-primary-400 to-primary-600 text-white font-extrabold text-2xl flex items-center justify-center flex-shrink-0 overflow-hidden">
                    {form.avatarUrl ? (
                      <img
                        src={form.avatarUrl}
                        alt="avatar"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      `${form.firstName?.[0] || ''}${form.lastName?.[0] || ''}`.toUpperCase() || '?'
                    )}
                  </div>
                  <div className="flex-1">
                    <Field label="URL de l'avatar">
                      <input
                        type="url"
                        value={form.avatarUrl}
                        onChange={(e) => setForm({ ...form, avatarUrl: e.target.value })}
                        className="input"
                        placeholder="https://..."
                      />
                    </Field>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <Field label="Prénom *" required>
                    <input
                      type="text"
                      value={form.firstName}
                      onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                      required
                      className="input"
                    />
                  </Field>
                  <Field label="Nom *" required>
                    <input
                      type="text"
                      value={form.lastName}
                      onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                      required
                      className="input"
                    />
                  </Field>
                </div>

                {isTeacher && (
                  <>
                    <Field label="Bio" hint="Présentation visible par les élèves (max 1000)">
                      <textarea
                        value={form.bio}
                        onChange={(e) => setForm({ ...form, bio: e.target.value })}
                        maxLength={1000}
                        className="input min-h-[120px] resize-none"
                        placeholder="Présentez-vous : parcours, pédagogie, passions..."
                      />
                      <p className="text-xs text-slate-400 mt-1">{form.bio.length}/1000</p>
                    </Field>

                    <div className="grid grid-cols-2 gap-4">
                      <Field label="École">
                        <input
                          type="text"
                          value={form.schoolName}
                          onChange={(e) => setForm({ ...form, schoolName: e.target.value })}
                          className="input"
                          placeholder="Ex: Lycée Bourguiba, Tunis"
                        />
                      </Field>
                      <Field label="Gouvernorat">
                        <select
                          value={form.governorate}
                          onChange={(e) => setForm({ ...form, governorate: e.target.value })}
                          className="input"
                        >
                          <option value="">— Choisir —</option>
                          {GOVERNORATES.map((g) => (
                            <option key={g} value={g}>
                              {g}
                            </option>
                          ))}
                        </select>
                      </Field>
                    </div>

                    <Field label="Diplôme">
                      <select
                        value={form.diploma}
                        onChange={(e) => setForm({ ...form, diploma: e.target.value })}
                        className="input"
                      >
                        <option value="">— Choisir —</option>
                        {DIPLOMAS.map((d) => (
                          <option key={d} value={d}>
                            {d}
                          </option>
                        ))}
                      </select>
                    </Field>
                  </>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <Field label="Téléphone" icon={Phone}>
                    <input
                      type="tel"
                      value={form.phone}
                      onChange={(e) => setForm({ ...form, phone: e.target.value })}
                      className="input"
                      placeholder="+216 ..."
                    />
                  </Field>
                  <Field label="Site web" icon={Globe}>
                    <input
                      type="url"
                      value={form.website}
                      onChange={(e) => setForm({ ...form, website: e.target.value })}
                      className="input"
                      placeholder="https://..."
                    />
                  </Field>
                </div>
              </SectionCard>
            )}

            {/* ENSEIGNEMENT (teacher only) */}
            {section === 'teaching' && (isTeacher || isAdmin) && (
              <SectionCard
                title="Enseignement"
                description="Configurez ce que vous enseignez"
                icon={BookOpen}
              >
                <Field
                  label="Matières enseignées"
                  hint={`${form.teachingSubjects.length} sélectionnée(s)`}
                >
                  <div className="flex flex-wrap gap-2">
                    {options.subjects.map((s) => {
                      const selected = form.teachingSubjects.includes(s.slug);
                      return (
                        <button
                          key={s.slug}
                          type="button"
                          onClick={() =>
                            setForm({
                              ...form,
                              teachingSubjects: selected
                                ? form.teachingSubjects.filter((v: string) => v !== s.slug)
                                : [...form.teachingSubjects, s.slug],
                            })
                          }
                          className={`px-3 py-1.5 rounded-full text-sm font-semibold transition ${
                            selected
                              ? 'bg-primary-500 text-white'
                              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                          }`}
                        >
                          {selected && <Check className="w-3.5 h-3.5 inline me-1" />}
                          {s.nameFr}
                        </button>
                      );
                    })}
                  </div>
                </Field>

                <Field label="Niveaux" hint={`${form.teachingLevels.length} sélectionné(s)`}>
                  <div className="flex flex-wrap gap-2">
                    {options.levels.map((l) => {
                      const selected = form.teachingLevels.includes(l.slug);
                      return (
                        <button
                          key={l.slug}
                          type="button"
                          onClick={() =>
                            setForm({
                              ...form,
                              teachingLevels: selected
                                ? form.teachingLevels.filter((v: string) => v !== l.slug)
                                : [...form.teachingLevels, l.slug],
                            })
                          }
                          className={`px-3 py-1.5 rounded-full text-sm font-semibold transition ${
                            selected
                              ? 'bg-emerald-500 text-white'
                              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                          }`}
                        >
                          {selected && <Check className="w-3.5 h-3.5 inline me-1" />}
                          {l.nameFr}
                        </button>
                      );
                    })}
                  </div>
                </Field>

                <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-sm text-blue-800">
                  💡 Ces informations aideront les élèves à trouver vos ressources pertinentes
                </div>
              </SectionCard>
            )}

            {/* SÉCURITÉ */}
            {section === 'security' && (
              <>
                <ChangePassword />
                <ChangeEmail currentEmail={account.email} />
              </>
            )}

            {/* NOTIFICATIONS */}
            {section === 'notifications' && (
              <SectionCard
                title="Notifications"
                description="Comment vous souhaitez être notifié"
                icon={Bell}
              >
                <ToggleRow
                  label="Notifications par email"
                  description="Recevoir les alertes importantes par email"
                  checked={form.notifyEmail}
                  onChange={(v) => setForm({ ...form, notifyEmail: v })}
                />
                <ToggleRow
                  label="Notifications in-app"
                  description="Voir les notifications dans le site (badge cloche)"
                  checked={form.notifyInApp}
                  onChange={(v) => setForm({ ...form, notifyInApp: v })}
                />
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-800">
                  ⚠️ Les emails critiques (sécurité, validation) sont toujours envoyés
                </div>
              </SectionCard>
            )}

            {/* PRÉFÉRENCES */}
            {section === 'preferences' && (
              <SectionCard title="Préférences" description="Langue et apparence" icon={Palette}>
                <Field label="Langue de l'interface">
                  <div className="grid grid-cols-2 gap-2">
                    {LANGS.map((l) => (
                      <button
                        key={l.code}
                        type="button"
                        onClick={() => setForm({ ...form, preferredLang: l.code })}
                        className={`px-4 py-3 rounded-xl font-semibold text-sm transition ${
                          form.preferredLang === l.code
                            ? 'bg-primary-500 text-white'
                            : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                        }`}
                      >
                        {l.label}
                      </button>
                    ))}
                  </div>
                </Field>

                <Field label="Thème">
                  <div className="grid grid-cols-3 gap-2">
                    {THEMES.map((t) => (
                      <button
                        key={t.code}
                        type="button"
                        onClick={() => setForm({ ...form, themePref: t.code })}
                        className={`px-4 py-3 rounded-xl font-semibold text-sm transition ${
                          form.themePref === t.code
                            ? 'bg-primary-500 text-white'
                            : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                        }`}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                </Field>
              </SectionCard>
            )}

            {/* COMPTE */}
            {section === 'account' && (
              <SectionCard
                title="Compte"
                description="Informations techniques du compte"
                icon={Shield}
              >
                <div className="space-y-3 text-sm">
                  <InfoRow label="Email actuel" value={account.email} />
                  <InfoRow
                    label="Rôle"
                    value={isAdmin ? '🛡️ Administrateur' : isTeacher ? '👨‍🏫 Enseignant' : '👨‍🎓 Élève'}
                  />
                  <InfoRow
                    label="Statut"
                    value={account.status === 'ACTIVE' ? '✅ Actif' : '⏸️ ' + account.status}
                  />
                  <InfoRow
                    label="Email vérifié"
                    value={account.emailVerifiedAt ? '✅ Oui' : '⚠️ Non vérifié'}
                  />
                  <InfoRow
                    label="Membre depuis"
                    value={new Date(account.createdAt).toLocaleDateString('fr-FR', {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    })}
                  />
                  <InfoRow
                    label="Dernière connexion"
                    value={
                      account.lastLoginAt
                        ? new Date(account.lastLoginAt).toLocaleString('fr-FR')
                        : '—'
                    }
                  />
                </div>

                {!isAdmin && (
                  <div className="mt-6 pt-6 border-t border-red-200">
                    <h3 className="font-bold text-red-600 mb-2">⚠️ Zone dangereuse</h3>
                    <p className="text-sm text-slate-600 mb-4">
                      La suppression de votre compte est définitive. Toutes vos données (ressources,
                      commentaires, favoris) seront perdues.
                    </p>
                    <button
                      onClick={async () => {
                        if (!confirm('Êtes-vous absolument sûr ? Cette action est irréversible.'))
                          return;
                        if (!confirm('DERNIÈRE CHANCE : vraiment supprimer votre compte ?')) return;
                        const res = await fetch('/api/user/account', { method: 'DELETE' });
                        if (res.ok) {
                          toast.success('Compte supprimé');
                          router.push('/');
                        } else {
                          toast.error('Erreur');
                        }
                      }}
                      className="px-4 py-2 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 rounded-xl text-sm font-semibold"
                    >
                      <Trash2 className="w-4 h-4 inline me-2" />
                      Supprimer mon compte
                    </button>
                  </div>
                )}
              </SectionCard>
            )}

            {/* ADMINISTRATION (admin only) */}
            {section === 'admin' && isAdmin && (
              <SectionCard
                title="Administration"
                description="Outils avancés réservés à l'administrateur"
                icon={Shield}
              >
                <div className="space-y-3">
                  <AdminLink
                    href="/admin/utilisateurs"
                    title="Gérer les utilisateurs"
                    desc="Activer, suspendre, supprimer, changer le rôle"
                    icon={User}
                  />
                  <AdminLink
                    href="/admin/approbations"
                    title="Approuver les contenus"
                    desc="Enseignants et ressources en attente"
                    icon={Check}
                  />
                  <AdminLink
                    href="/admin/ressources"
                    title="Toutes les ressources"
                    desc="Vue d'ensemble et modération"
                    icon={BookOpen}
                  />
                  <AdminLink
                    href="/admin/moderation"
                    title="Modération"
                    desc="Signalements à traiter"
                    icon={Shield}
                  />
                </div>
              </SectionCard>
            )}

            {/* Save bar */}
            {section !== 'security' && section !== 'admin' && section !== 'account' && (
              <div className="sticky bottom-4 flex justify-end">
                <button
                  onClick={save}
                  disabled={saving}
                  className="btn-primary shadow-2xl flex items-center gap-2"
                >
                  {saving ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4" />
                  )}
                  Enregistrer les modifications
                </button>
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}

function SectionCard({ title, description, icon: Icon, children }: any) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6">
      <div className="flex items-center gap-3 mb-1">
        <div className="w-10 h-10 rounded-xl bg-primary-50 text-primary-600 flex items-center justify-center">
          <Icon className="w-5 h-5" />
        </div>
        <div>
          <h2 className="font-bold text-lg">{title}</h2>
          {description && <p className="text-sm text-slate-500">{description}</p>}
        </div>
      </div>
      <div className="mt-4 space-y-4">{children}</div>
    </div>
  );
}

function Field({ label, hint, required, icon: Icon, children }: any) {
  return (
    <div>
      <label className="label flex items-center gap-1.5">
        {Icon && <Icon className="w-3.5 h-3.5" />}
        {label}
        {required && <span className="text-red-500">*</span>}
      </label>
      {children}
      {hint && <p className="text-xs text-slate-500 mt-1">{hint}</p>}
    </div>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
      <div>
        <div className="font-semibold text-sm">{label}</div>
        {description && <div className="text-xs text-slate-500">{description}</div>}
      </div>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`relative w-12 h-6 rounded-full transition ${checked ? 'bg-emerald-500' : 'bg-slate-300'}`}
      >
        <div
          className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition ${checked ? 'start-6' : 'start-0.5'}`}
        />
      </button>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center py-2 border-b border-slate-100 last:border-0">
      <span className="text-slate-500">{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}

function AdminLink({ href, title, desc, icon: Icon }: any) {
  return (
    <a
      href={href}
      className="flex items-start gap-3 p-3 hover:bg-slate-50 rounded-xl transition border border-slate-200"
    >
      <div className="w-10 h-10 rounded-xl bg-primary-50 text-primary-600 flex items-center justify-center flex-shrink-0">
        <Icon className="w-5 h-5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-sm">{title}</div>
        <div className="text-xs text-slate-500">{desc}</div>
      </div>
      <span className="text-slate-400">→</span>
    </a>
  );
}

function ChangePassword() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);

  async function submit() {
    if (next !== confirm) {
      toast.error('Les mots de passe ne correspondent pas');
      return;
    }
    if (next.length < 8) {
      toast.error('Minimum 8 caractères');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/user/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error);
        return;
      }

      // Build an honest toast that reports what actually happened
      const parts: string[] = ['Mot de passe changé ✅'];
      if (data.sessionsInvalidated > 0) {
        parts.push(
          `${data.sessionsInvalidated} autre${data.sessionsInvalidated > 1 ? 's' : ''} session${data.sessionsInvalidated > 1 ? 's' : ''} déconnectée${data.sessionsInvalidated > 1 ? 's' : ''}`,
        );
      }
      if (data.emailSent === true) {
        parts.push('email de confirmation envoyé');
      } else if (data.emailSent === false) {
        parts.push("⚠️ email de confirmation NON envoyé (vérifiez vos spams ou contactez l'admin)");
      }
      toast.success(parts.join(' — '), { duration: 8000 });

      setCurrent('');
      setNext('');
      setConfirm('');
    } catch {
      toast.error('Erreur réseau');
    } finally {
      setLoading(false);
    }
  }

  return (
    <SectionCard
      title="Mot de passe"
      description="Changez votre mot de passe régulièrement"
      icon={Lock}
    >
      <Field label="Mot de passe actuel">
        <div className="relative">
          <input
            type={show ? 'text' : 'password'}
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            className="input pe-10"
          />
          <button
            type="button"
            onClick={() => setShow(!show)}
            className="absolute end-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600"
          >
            {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
      </Field>
      <Field label="Nouveau mot de passe" hint="Minimum 8 caractères">
        <input
          type={show ? 'text' : 'password'}
          value={next}
          onChange={(e) => setNext(e.target.value)}
          className="input"
        />
      </Field>
      <Field label="Confirmer">
        <input
          type={show ? 'text' : 'password'}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className="input"
        />
      </Field>
      <div className="bg-sky-50 border border-sky-200 rounded-xl p-3 text-sm text-sky-800 flex items-start gap-2">
        <Shield className="w-4 h-4 flex-shrink-0 mt-0.5" />
        <div>
          <strong>Notification de sécurité :</strong> un email de confirmation vous sera envoyé
          après chaque modification, avec l'adresse IP, l'heure et l'appareil utilisé. Si vous
          n'êtes pas à l'origine de ce changement, contactez-nous immédiatement via{' '}
          <a href="/contact?subject=compromised&motif=password" className="underline font-semibold">
            notre page de contact
          </a>
          .
        </div>
      </div>
      <button
        onClick={submit}
        disabled={loading || !current || !next || !confirm}
        className="btn-primary flex items-center gap-2"
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
        Changer le mot de passe
      </button>
    </SectionCard>
  );
}

function ChangeEmail({ currentEmail }: { currentEmail: string }) {
  const [newEmail, setNewEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit() {
    if (!newEmail || !password) {
      toast.error('Tous les champs sont requis');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/user/change-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newEmail, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error);
        return;
      }
      toast.success('Email changé ✅ Reconnectez-vous.');
      setTimeout(() => (window.location.href = '/connexion'), 1500);
    } catch {
      toast.error('Erreur réseau');
    } finally {
      setLoading(false);
    }
  }

  return (
    <SectionCard title="Adresse email" description="Changer l'email de connexion" icon={Mail}>
      <Field label="Email actuel">
        <input type="email" value={currentEmail} disabled className="input bg-slate-100" />
      </Field>
      <Field label="Nouvel email">
        <input
          type="email"
          value={newEmail}
          onChange={(e) => setNewEmail(e.target.value)}
          className="input"
          placeholder="nouveau@email.com"
        />
      </Field>
      <Field label="Confirmez avec votre mot de passe">
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="input"
        />
      </Field>
      <button
        onClick={submit}
        disabled={loading || !newEmail || !password}
        className="btn-primary flex items-center gap-2"
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
        Changer l'email
      </button>
    </SectionCard>
  );
}
