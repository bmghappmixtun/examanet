'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import {
  Plus,
  Edit3,
  Trash2,
  Save,
  X,
  Loader2,
  BookOpen,
  GraduationCap,
  Layers,
  FolderOpen,
  Search,
} from 'lucide-react';

type Subject = {
  id: string;
  slug: string;
  nameFr: string;
  nameAr: string;
  icon?: string | null;
  color?: string | null;
  order: number;
  _count?: { resources: number };
};

type Level = {
  id: string;
  slug: string;
  nameFr: string;
  nameAr: string;
  order: number;
  _count?: { classes: number };
};

type Class = {
  id: string;
  slug: string;
  nameFr: string;
  nameAr: string;
  order: number;
  level: { nameFr: string; slug: string };
  _count?: { resources: number; sections: number };
};

type Section = {
  id: string;
  slug: string;
  nameFr: string;
  nameAr: string;
  class: { nameFr: string; slug: string };
  _count?: { resources: number };
};

type CatalogData = {
  subjects: Subject[];
  levels: Level[];
  classes: Class[];
  sections: Section[];
};

const EMOJIS_FOR_SUBJECTS = [
  '📐',
  '🧪',
  '🌍',
  '📚',
  '✏️',
  '🇬🇧',
  '🇫🇷',
  '💻',
  '🎨',
  '🎵',
  '⚗️',
  '🌱',
  '🏛️',
  '💼',
];

export default function CatalogAdminClient({ initialData }: { initialData: CatalogData }) {
  const router = useRouter();
  const [tab, setTab] = useState<'subjects' | 'levels' | 'classes' | 'sections'>('subjects');
  const [search, setSearch] = useState('');

  const filtered = (items: any[]) => {
    if (!search.trim()) return items;
    const q = search.toLowerCase();
    return items.filter(
      (i) =>
        i.nameFr?.toLowerCase().includes(q) ||
        i.nameAr?.toLowerCase().includes(q) ||
        i.slug?.toLowerCase().includes(q),
    );
  };

  const refresh = () => router.refresh();

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-extrabold">⚙️ Catalogue de la plateforme</h1>
          <p className="text-slate-600 text-sm">Gérez les matières, niveaux, classes et sections</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 border-b border-slate-200 overflow-x-auto">
        <TabBtn
          active={tab === 'subjects'}
          onClick={() => setTab('subjects')}
          icon={BookOpen}
          label="Matières"
          count={initialData.subjects.length}
        />
        <TabBtn
          active={tab === 'levels'}
          onClick={() => setTab('levels')}
          icon={GraduationCap}
          label="Niveaux"
          count={initialData.levels.length}
        />
        <TabBtn
          active={tab === 'classes'}
          onClick={() => setTab('classes')}
          icon={Layers}
          label="Classes"
          count={initialData.classes.length}
        />
        <TabBtn
          active={tab === 'sections'}
          onClick={() => setTab('sections')}
          icon={FolderOpen}
          label="Sections"
          count={initialData.sections.length}
        />
      </div>

      {/* Search */}
      <div className="mb-4 relative">
        <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filtrer par nom ou slug..."
          className="w-full ps-10 pe-4 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
        />
      </div>

      {/* Tables */}
      {tab === 'subjects' && (
        <SubjectsTable subjects={filtered(initialData.subjects) as Subject[]} onChange={refresh} />
      )}
      {tab === 'levels' && (
        <LevelsTable levels={filtered(initialData.levels) as Level[]} onChange={refresh} />
      )}
      {tab === 'classes' && (
        <ClassesTable
          classes={filtered(initialData.classes) as Class[]}
          levels={initialData.levels}
          onChange={refresh}
        />
      )}
      {tab === 'sections' && (
        <SectionsTable
          sections={filtered(initialData.sections) as Section[]}
          classes={initialData.classes}
          onChange={refresh}
        />
      )}
    </div>
  );
}

function TabBtn({ active, onClick, icon: Icon, label, count }: any) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-3 font-semibold text-sm border-b-2 transition whitespace-nowrap ${
        active
          ? 'border-primary-500 text-primary-600'
          : 'border-transparent text-slate-500 hover:text-slate-700'
      }`}
    >
      <Icon className="w-4 h-4" />
      {label}
      <span
        className={`px-2 py-0.5 rounded-full text-xs ${active ? 'bg-primary-100 text-primary-700' : 'bg-slate-100 text-slate-500'}`}
      >
        {count}
      </span>
    </button>
  );
}

// ============ SUBJECTS ============
function SubjectsTable({ subjects, onChange }: { subjects: Subject[]; onChange: () => void }) {
  const [editing, setEditing] = useState<Subject | null>(null);
  const [creating, setCreating] = useState(false);

  return (
    <>
      <div className="flex justify-end mb-3">
        <button onClick={() => setCreating(true)} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" />
          Nouvelle matière
        </button>
      </div>
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="text-left px-4 py-3 font-semibold">Icône</th>
              <th className="text-left px-4 py-3 font-semibold">Nom (FR)</th>
              <th className="text-left px-4 py-3 font-semibold">Nom (AR)</th>
              <th className="text-left px-4 py-3 font-semibold">Slug</th>
              <th className="text-left px-4 py-3 font-semibold">Ordre</th>
              <th className="text-left px-4 py-3 font-semibold">Ressources</th>
              <th className="text-right px-4 py-3 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {subjects.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center py-8 text-slate-400">
                  Aucune matière
                </td>
              </tr>
            )}
            {subjects.map((s) => (
              <tr key={s.id} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="px-4 py-3 text-2xl">{s.icon || '📚'}</td>
                <td className="px-4 py-3 font-semibold">{s.nameFr}</td>
                <td className="px-4 py-3" dir="rtl">
                  {s.nameAr}
                </td>
                <td className="px-4 py-3">
                  <code className="text-xs bg-slate-100 px-2 py-0.5 rounded">{s.slug}</code>
                </td>
                <td className="px-4 py-3 text-slate-500">{s.order}</td>
                <td className="px-4 py-3">
                  <span className="font-semibold">{s._count?.resources || 0}</span>
                </td>
                <td className="px-4 py-3 text-right">
                  <ActionButtons
                    onEdit={() => setEditing(s)}
                    onDelete={async () => {
                      if (!confirm(`Supprimer "${s.nameFr}" ?`)) return;
                      const res = await fetch(`/api/admin/catalog/subjects/${s.id}`, {
                        method: 'DELETE',
                      });
                      const data = await res.json();
                      if (res.ok) {
                        toast.success('Supprimé');
                        onChange();
                      } else toast.error(data.error);
                    }}
                    deleteDisabled={(s._count?.resources || 0) > 0}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {(editing || creating) && (
        <SubjectModal
          subject={editing}
          onClose={() => {
            setEditing(null);
            setCreating(false);
          }}
          onSave={() => {
            setEditing(null);
            setCreating(false);
            onChange();
          }}
        />
      )}
    </>
  );
}

function SubjectModal({ subject, onClose, onSave }: any) {
  const isNew = !subject;
  const [form, setForm] = useState({
    slug: subject?.slug || '',
    nameFr: subject?.nameFr || '',
    nameAr: subject?.nameAr || '',
    icon: subject?.icon || '📐',
    color: subject?.color || '',
    order: subject?.order ?? 0,
  });
  const [loading, setLoading] = useState(false);

  async function submit() {
    if (!form.slug || !form.nameFr || !form.nameAr) {
      toast.error('Slug, nom FR, nom AR sont requis');
      return;
    }
    setLoading(true);
    try {
      const url = isNew
        ? '/api/admin/catalog/subjects'
        : `/api/admin/catalog/subjects/${subject.id}`;
      const res = await fetch(url, {
        method: isNew ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error);
        return;
      }
      toast.success(isNew ? 'Matière créée' : 'Matière mise à jour');
      onSave();
    } catch {
      toast.error('Erreur');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal onClose={onClose} title={isNew ? 'Nouvelle matière' : 'Modifier la matière'}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Nom français *">
            <input
              value={form.nameFr}
              onChange={(e) => setForm({ ...form, nameFr: e.target.value })}
              className="input"
              placeholder="Mathématiques"
            />
          </Field>
          <Field label="Nom arabe *" hint="Nom affiché en RTL">
            <input
              value={form.nameAr}
              onChange={(e) => setForm({ ...form, nameAr: e.target.value })}
              className="input"
              dir="rtl"
              placeholder="الرياضيات"
            />
          </Field>
        </div>
        <Field label="Slug *" hint="Identifiant URL en minuscules">
          <input
            value={form.slug}
            onChange={(e) =>
              setForm({ ...form, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') })
            }
            className="input font-mono"
            placeholder="mathematiques"
          />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Icône">
            <div className="flex gap-2">
              <input
                value={form.icon}
                onChange={(e) => setForm({ ...form, icon: e.target.value })}
                className="input flex-1 text-center text-2xl"
                maxLength={4}
              />
              <div className="flex gap-1 flex-wrap max-w-[180px]">
                {EMOJIS_FOR_SUBJECTS.map((e) => (
                  <button
                    key={e}
                    type="button"
                    onClick={() => setForm({ ...form, icon: e })}
                    className="text-xl hover:bg-slate-100 rounded p-1"
                  >
                    {e}
                  </button>
                ))}
              </div>
            </div>
          </Field>
          <Field label="Couleur (hex)">
            <input
              value={form.color}
              onChange={(e) => setForm({ ...form, color: e.target.value })}
              className="input"
              placeholder="#0EA5E9"
            />
          </Field>
        </div>
        <Field label="Ordre d'affichage">
          <input
            type="number"
            value={form.order}
            onChange={(e) => setForm({ ...form, order: parseInt(e.target.value) || 0 })}
            className="input"
          />
        </Field>
        <ModalActions
          onClose={onClose}
          onSubmit={submit}
          loading={loading}
          submitLabel={isNew ? 'Créer' : 'Enregistrer'}
        />
      </div>
    </Modal>
  );
}

// ============ LEVELS ============
function LevelsTable({ levels, onChange }: { levels: Level[]; onChange: () => void }) {
  const [editing, setEditing] = useState<Level | null>(null);
  const [creating, setCreating] = useState(false);

  return (
    <>
      <div className="flex justify-end mb-3">
        <button onClick={() => setCreating(true)} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" /> Nouveau niveau
        </button>
      </div>
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="text-left px-4 py-3 font-semibold">Nom (FR)</th>
              <th className="text-left px-4 py-3 font-semibold">Nom (AR)</th>
              <th className="text-left px-4 py-3 font-semibold">Slug</th>
              <th className="text-left px-4 py-3 font-semibold">Ordre</th>
              <th className="text-left px-4 py-3 font-semibold">Classes</th>
              <th className="text-right px-4 py-3 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {levels.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center py-8 text-slate-400">
                  Aucun niveau
                </td>
              </tr>
            )}
            {levels.map((l) => (
              <tr key={l.id} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="px-4 py-3 font-semibold">{l.nameFr}</td>
                <td className="px-4 py-3" dir="rtl">
                  {l.nameAr}
                </td>
                <td className="px-4 py-3">
                  <code className="text-xs bg-slate-100 px-2 py-0.5 rounded">{l.slug}</code>
                </td>
                <td className="px-4 py-3 text-slate-500">{l.order}</td>
                <td className="px-4 py-3">
                  <span className="font-semibold">{l._count?.classes || 0}</span>
                </td>
                <td className="px-4 py-3 text-right">
                  <ActionButtons
                    onEdit={() => setEditing(l)}
                    onDelete={async () => {
                      if (!confirm(`Supprimer "${l.nameFr}" ?`)) return;
                      const res = await fetch(`/api/admin/catalog/levels/${l.id}`, {
                        method: 'DELETE',
                      });
                      const data = await res.json();
                      if (res.ok) {
                        toast.success('Supprimé');
                        onChange();
                      } else toast.error(data.error);
                    }}
                    deleteDisabled={(l._count?.classes || 0) > 0}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {(editing || creating) && (
        <LevelModal
          level={editing}
          onClose={() => {
            setEditing(null);
            setCreating(false);
          }}
          onSave={() => {
            setEditing(null);
            setCreating(false);
            onChange();
          }}
        />
      )}
    </>
  );
}

function LevelModal({ level, onClose, onSave }: any) {
  const isNew = !level;
  const [form, setForm] = useState({
    slug: level?.slug || '',
    nameFr: level?.nameFr || '',
    nameAr: level?.nameAr || '',
    order: level?.order ?? 0,
  });
  const [loading, setLoading] = useState(false);

  async function submit() {
    setLoading(true);
    try {
      const url = isNew ? '/api/admin/catalog/levels' : `/api/admin/catalog/levels/${level.id}`;
      const res = await fetch(url, {
        method: isNew ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error);
        return;
      }
      toast.success(isNew ? 'Niveau créé' : 'Niveau mis à jour');
      onSave();
    } catch {
      toast.error('Erreur');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal onClose={onClose} title={isNew ? 'Nouveau niveau' : 'Modifier le niveau'}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Nom français *">
            <input
              value={form.nameFr}
              onChange={(e) => setForm({ ...form, nameFr: e.target.value })}
              className="input"
              placeholder="Lycée"
            />
          </Field>
          <Field label="Nom arabe *" hint="Affiché en RTL">
            <input
              value={form.nameAr}
              onChange={(e) => setForm({ ...form, nameAr: e.target.value })}
              className="input"
              dir="rtl"
              placeholder="الثانوي"
            />
          </Field>
        </div>
        <Field label="Slug *">
          <input
            value={form.slug}
            onChange={(e) =>
              setForm({ ...form, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') })
            }
            className="input font-mono"
            placeholder="lycee"
          />
        </Field>
        <Field label="Ordre d'affichage">
          <input
            type="number"
            value={form.order}
            onChange={(e) => setForm({ ...form, order: parseInt(e.target.value) || 0 })}
            className="input"
          />
        </Field>
        <ModalActions
          onClose={onClose}
          onSubmit={submit}
          loading={loading}
          submitLabel={isNew ? 'Créer' : 'Enregistrer'}
        />
      </div>
    </Modal>
  );
}

// ============ CLASSES ============
function ClassesTable({
  classes,
  levels,
  onChange,
}: {
  classes: Class[];
  levels: Level[];
  onChange: () => void;
}) {
  const [editing, setEditing] = useState<Class | null>(null);
  const [creating, setCreating] = useState(false);

  return (
    <>
      <div className="flex justify-end mb-3">
        <button onClick={() => setCreating(true)} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" /> Nouvelle classe
        </button>
      </div>
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="text-left px-4 py-3 font-semibold">Nom (FR)</th>
              <th className="text-left px-4 py-3 font-semibold">Nom (AR)</th>
              <th className="text-left px-4 py-3 font-semibold">Niveau</th>
              <th className="text-left px-4 py-3 font-semibold">Slug</th>
              <th className="text-left px-4 py-3 font-semibold">Sections</th>
              <th className="text-left px-4 py-3 font-semibold">Ressources</th>
              <th className="text-right px-4 py-3 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {classes.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center py-8 text-slate-400">
                  Aucune classe
                </td>
              </tr>
            )}
            {classes.map((c) => (
              <tr key={c.id} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="px-4 py-3 font-semibold">{c.nameFr}</td>
                <td className="px-4 py-3" dir="rtl">
                  {c.nameAr}
                </td>
                <td className="px-4 py-3">
                  <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded font-semibold">
                    {c.level.nameFr}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <code className="text-xs bg-slate-100 px-2 py-0.5 rounded">{c.slug}</code>
                </td>
                <td className="px-4 py-3">
                  <span className="font-semibold">{c._count?.sections || 0}</span>
                </td>
                <td className="px-4 py-3">
                  <span className="font-semibold">{c._count?.resources || 0}</span>
                </td>
                <td className="px-4 py-3 text-right">
                  <ActionButtons
                    onEdit={() => setEditing(c)}
                    onDelete={async () => {
                      if (!confirm(`Supprimer "${c.nameFr}" ?`)) return;
                      const res = await fetch(`/api/admin/catalog/classes/${c.id}`, {
                        method: 'DELETE',
                      });
                      const data = await res.json();
                      if (res.ok) {
                        toast.success('Supprimé');
                        onChange();
                      } else toast.error(data.error);
                    }}
                    deleteDisabled={(c._count?.resources || 0) > 0}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {(editing || creating) && (
        <ClassModal
          cls={editing}
          levels={levels}
          onClose={() => {
            setEditing(null);
            setCreating(false);
          }}
          onSave={() => {
            setEditing(null);
            setCreating(false);
            onChange();
          }}
        />
      )}
    </>
  );
}

function ClassModal({ cls, levels, onClose, onSave }: any) {
  const isNew = !cls;
  const [form, setForm] = useState({
    slug: cls?.slug || '',
    nameFr: cls?.nameFr || '',
    nameAr: cls?.nameAr || '',
    levelId: cls?.levelId || levels[0]?.id || '',
    order: cls?.order ?? 0,
  });
  const [loading, setLoading] = useState(false);

  async function submit() {
    setLoading(true);
    try {
      const url = isNew ? '/api/admin/catalog/classes' : `/api/admin/catalog/classes/${cls.id}`;
      const res = await fetch(url, {
        method: isNew ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error);
        return;
      }
      toast.success(isNew ? 'Classe créée' : 'Classe mise à jour');
      onSave();
    } catch {
      toast.error('Erreur');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal onClose={onClose} title={isNew ? 'Nouvelle classe' : 'Modifier la classe'}>
      <div className="space-y-4">
        <Field label="Niveau *">
          <select
            value={form.levelId}
            onChange={(e) => setForm({ ...form, levelId: e.target.value })}
            className="input"
          >
            {levels.map((l: Level) => (
              <option key={l.id} value={l.id}>
                {l.nameFr}
              </option>
            ))}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Nom français *">
            <input
              value={form.nameFr}
              onChange={(e) => setForm({ ...form, nameFr: e.target.value })}
              className="input"
              placeholder="7ème année de base"
            />
          </Field>
          <Field label="Nom arabe *" hint="Affiché en RTL">
            <input
              value={form.nameAr}
              onChange={(e) => setForm({ ...form, nameAr: e.target.value })}
              className="input"
              dir="rtl"
              placeholder="السابع أساسي"
            />
          </Field>
        </div>
        <Field label="Slug *">
          <input
            value={form.slug}
            onChange={(e) =>
              setForm({ ...form, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') })
            }
            className="input font-mono"
            placeholder="7eme-base"
          />
        </Field>
        <Field label="Ordre d'affichage">
          <input
            type="number"
            value={form.order}
            onChange={(e) => setForm({ ...form, order: parseInt(e.target.value) || 0 })}
            className="input"
          />
        </Field>
        <ModalActions
          onClose={onClose}
          onSubmit={submit}
          loading={loading}
          submitLabel={isNew ? 'Créer' : 'Enregistrer'}
        />
      </div>
    </Modal>
  );
}

// ============ SECTIONS ============
function SectionsTable({
  sections,
  classes,
  onChange,
}: {
  sections: Section[];
  classes: Class[];
  onChange: () => void;
}) {
  const [editing, setEditing] = useState<Section | null>(null);
  const [creating, setCreating] = useState(false);

  return (
    <>
      <div className="flex justify-end mb-3">
        <button onClick={() => setCreating(true)} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" /> Nouvelle section
        </button>
      </div>
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="text-left px-4 py-3 font-semibold">Nom (FR)</th>
              <th className="text-left px-4 py-3 font-semibold">Nom (AR)</th>
              <th className="text-left px-4 py-3 font-semibold">Classe</th>
              <th className="text-left px-4 py-3 font-semibold">Slug</th>
              <th className="text-left px-4 py-3 font-semibold">Ressources</th>
              <th className="text-right px-4 py-3 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sections.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center py-8 text-slate-400">
                  Aucune section
                </td>
              </tr>
            )}
            {sections.map((s) => (
              <tr key={s.id} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="px-4 py-3 font-semibold">{s.nameFr}</td>
                <td className="px-4 py-3" dir="rtl">
                  {s.nameAr}
                </td>
                <td className="px-4 py-3">
                  <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded font-semibold">
                    {s.class.nameFr}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <code className="text-xs bg-slate-100 px-2 py-0.5 rounded">{s.slug}</code>
                </td>
                <td className="px-4 py-3">
                  <span className="font-semibold">{s._count?.resources || 0}</span>
                </td>
                <td className="px-4 py-3 text-right">
                  <ActionButtons
                    onEdit={() => setEditing(s)}
                    onDelete={async () => {
                      if (!confirm(`Supprimer "${s.nameFr}" ?`)) return;
                      const res = await fetch(`/api/admin/catalog/sections/${s.id}`, {
                        method: 'DELETE',
                      });
                      const data = await res.json();
                      if (res.ok) {
                        toast.success('Supprimé');
                        onChange();
                      } else toast.error(data.error);
                    }}
                    deleteDisabled={(s._count?.resources || 0) > 0}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {(editing || creating) && (
        <SectionModal
          section={editing}
          classes={classes}
          onClose={() => {
            setEditing(null);
            setCreating(false);
          }}
          onSave={() => {
            setEditing(null);
            setCreating(false);
            onChange();
          }}
        />
      )}
    </>
  );
}

function SectionModal({ section, classes, onClose, onSave }: any) {
  const isNew = !section;
  const [form, setForm] = useState({
    slug: section?.slug || '',
    nameFr: section?.nameFr || '',
    nameAr: section?.nameAr || '',
    classId: section?.classId || classes[0]?.id || '',
  });
  const [loading, setLoading] = useState(false);

  async function submit() {
    setLoading(true);
    try {
      const url = isNew
        ? '/api/admin/catalog/sections'
        : `/api/admin/catalog/sections/${section.id}`;
      const res = await fetch(url, {
        method: isNew ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error);
        return;
      }
      toast.success(isNew ? 'Section créée' : 'Section mise à jour');
      onSave();
    } catch {
      toast.error('Erreur');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal onClose={onClose} title={isNew ? 'Nouvelle section' : 'Modifier la section'}>
      <div className="space-y-4">
        <Field label="Classe *">
          <select
            value={form.classId}
            onChange={(e) => setForm({ ...form, classId: e.target.value })}
            className="input"
          >
            {classes.map((c: Class) => (
              <option key={c.id} value={c.id}>
                {c.level.nameFr} → {c.nameFr}
              </option>
            ))}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Nom français *">
            <input
              value={form.nameFr}
              onChange={(e) => setForm({ ...form, nameFr: e.target.value })}
              className="input"
              placeholder="Sciences"
            />
          </Field>
          <Field label="Nom arabe *" hint="Affiché en RTL">
            <input
              value={form.nameAr}
              onChange={(e) => setForm({ ...form, nameAr: e.target.value })}
              className="input"
              dir="rtl"
              placeholder="علوم"
            />
          </Field>
        </div>
        <Field label="Slug *">
          <input
            value={form.slug}
            onChange={(e) =>
              setForm({ ...form, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') })
            }
            className="input font-mono"
            placeholder="sciences"
          />
        </Field>
        <ModalActions
          onClose={onClose}
          onSubmit={submit}
          loading={loading}
          submitLabel={isNew ? 'Créer' : 'Enregistrer'}
        />
      </div>
    </Modal>
  );
}

// ============ COMMON ============
function ActionButtons({ onEdit, onDelete, deleteDisabled = false }: any) {
  return (
    <div className="flex gap-1 justify-end">
      <button
        onClick={onEdit}
        className="p-1.5 hover:bg-blue-50 text-blue-600 rounded"
        title="Modifier"
      >
        <Edit3 className="w-4 h-4" />
      </button>
      <button
        onClick={onDelete}
        disabled={deleteDisabled}
        className="p-1.5 hover:bg-red-50 text-red-600 rounded disabled:opacity-30 disabled:cursor-not-allowed"
        title={deleteDisabled ? "Supprimer les ressources associées d'abord" : 'Supprimer'}
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  );
}

function Modal({ children, onClose, title }: any) {
  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/50"
          role="presentation"
          onKeyDown={(e) => { if (e.key === "Escape") (e.currentTarget as HTMLDivElement)?.click(); }}
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl"
          role="dialog"
          aria-modal="true"
        onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-6 border-b border-slate-200 sticky top-0 bg-white">
          <h2 className="font-bold text-lg">{title}</h2>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

function Field({ label, hint, children }: any) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
      {hint && <p className="text-xs text-slate-500 mt-1">{hint}</p>}
    </div>
  );
}

function ModalActions({ onClose, onSubmit, loading, submitLabel }: any) {
  return (
    <div className="flex justify-end gap-2 pt-4 border-t border-slate-200">
      <button
        onClick={onClose}
        className="px-4 py-2 border border-slate-200 rounded-xl hover:bg-slate-50 font-semibold text-sm"
      >
        Annuler
      </button>
      <button onClick={onSubmit} disabled={loading} className="btn-primary flex items-center gap-2">
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
        {submitLabel}
      </button>
    </div>
  );
}
