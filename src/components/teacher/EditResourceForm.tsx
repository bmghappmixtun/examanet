'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { Save, Upload, FileText, Loader2, AlertCircle } from 'lucide-react';

type Resource = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  type: string;
  subjectId: string;
  classId: string | null;
  sectionId: string | null;
  trimester: string | null;
  year: string | null;
  tags: string | null;
  language: string;
  fileKey: string;
  fileSize: number;
  status: string;
  editStatus: string | null;
  // Homework & school metadata (NEW)
  homeworkSubtype?: string | null;
  homeworkNumber?: number | null;
  schoolType?: string | null;
  product?: string | null;
  hasCorrection?: boolean;
  correctionSummary?: string | null;
};

type Option = { id: string; slug?: string; nameFr: string; icon?: string; classId?: string };

const TYPES = [
  { v: 'COURSE', l: '📖 Cours' },
  { v: 'DEVOIR', l: '📝 Devoir' },
  { v: 'EXERCISE', l: '✏️ Exercice' },
  { v: 'SERIES', l: '📚 Série' },
  { v: 'BAC_SUBJECT', l: '🎓 Sujet Bac' },
  { v: 'CORRECTION', l: '✅ Corrigé' },
  { v: 'SUMMARY', l: '📄 Résumé' },
  { v: 'CARD', l: '🗂️ Fiche' },
];

const TRIMESTERS = [
  { v: '', l: '—' },
  { v: 'T1', l: '1er trimestre' },
  { v: 'T2', l: '2ème trimestre' },
  { v: 'T3', l: '3ème trimestre' },
];

const LANGUAGES = [
  { v: 'fr', l: '🇫🇷 Français' },
  { v: 'ar', l: '🇹🇳 العربية' },
  { v: 'en', l: '🇬🇧 English' },
  { v: 'it', l: '🇮🇹 Italiano' },
  { v: 'de', l: '🇩🇪 Deutsch' },
  { v: 'es', l: '🇪🇸 Español' },
  { v: 'fr+ar', l: '🇫🇷 + 🇹🇳' },
];

export default function EditResourceForm({
  resource,
  pending,
  subjects,
  classes,
  sections,
  readOnly,
}: {
  resource: Resource;
  pending: any;
  subjects: Option[];
  classes: Option[];
  sections: Option[];
  readOnly: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [fileLoading, setFileLoading] = useState(false);

  // Form state - default to current values
  const [title, setTitle] = useState(resource.title);
  const [description, setDescription] = useState(resource.description || '');
  const [type, setType] = useState(resource.type);
  const [subjectId, setSubjectId] = useState(resource.subjectId);
  const [classId, setClassId] = useState(resource.classId || '');
  const [sectionId, setSectionId] = useState(resource.sectionId || '');
  const [trimester, setTrimester] = useState(resource.trimester || '');
  const [year, setYear] = useState(resource.year || '');
  const [tags, setTags] = useState(resource.tags || '');
  const [language, setLanguage] = useState(resource.language);
  // Homework & school metadata (NEW)
  const [homeworkSubtype, setHomeworkSubtype] = useState<string>(resource.homeworkSubtype || '');
  const [homeworkNumber, setHomeworkNumber] = useState<number | ''>(resource.homeworkNumber || '');
  const [schoolType, setSchoolType] = useState<string>(resource.schoolType || 'PUBLIC');
  const [product, setProduct] = useState<string>(resource.product || '');
  const [hasCorrection, setHasCorrection] = useState<boolean>(resource.hasCorrection || false);
  const [correctionSummary, setCorrectionSummary] = useState<string>(
    resource.correctionSummary || '',
  );

  // Look up class slug to determine if college technologie
  const selectedClass = classes.find((c) => c.id === classId);
  const selectedSubject = subjects.find((s) => s.id === subjectId);
  const showProductField =
    selectedSubject?.slug === 'technologie' &&
    ['7eme', '8eme', '9eme'].includes(selectedClass?.slug || '');

  // Filter sections by selected class
  const filteredSections = classId ? sections.filter((s) => s.classId === classId) : sections;

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (readOnly) return;
    if (title.length < 5) {
      toast.error('Titre trop court (min 5 caractères)');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/teacher/resources/${resource.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          description,
          type,
          subjectId,
          classId: classId || null,
          sectionId: sectionId || null,
          trimester: trimester || null,
          year: year || null,
          tags: tags || null,
          language,
          // Homework & school metadata (NEW)
          homeworkSubtype: type === 'DEVOIR' && homeworkSubtype ? homeworkSubtype : null,
          homeworkNumber: type === 'DEVOIR' && homeworkNumber ? Number(homeworkNumber) : null,
          schoolType: schoolType || 'PUBLIC',
          product: showProductField && product ? product : null,
          hasCorrection,
          correctionSummary: hasCorrection && correctionSummary ? correctionSummary : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur');
      toast.success(data.message || 'Modifications enregistrées !');
      router.push('/enseignant/ressources');
      router.refresh();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (readOnly) return;
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== 'application/pdf') {
      toast.error('Le fichier doit être un PDF');
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      toast.error('Max 50 MB');
      return;
    }

    setFileLoading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch(`/api/teacher/resources/${resource.id}/file`, {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur');
      toast.success(data.message || "Nouveau fichier en attente d'approbation");
      router.push('/enseignant/ressources');
      router.refresh();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setFileLoading(false);
    }
  }

  if (readOnly) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center">
        <AlertCircle className="w-12 h-12 mx-auto mb-3 text-blue-500" />
        <h3 className="font-bold text-lg mb-2">Modifications en cours d'approbation</h3>
        <p className="text-slate-500 mb-4">
          Vous pourrez proposer de nouvelles modifications une fois la précédente traitée.
        </p>
        <Link href="/enseignant/ressources" className="btn-primary">
          Retour à mes ressources
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSave} className="space-y-4">
      {/* File replacement (separate section) */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5">
        <h3 className="font-bold text-sm text-slate-700 mb-3 flex items-center gap-2">
          📎 Fichier PDF
        </h3>
        <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg mb-3">
          <FileText className="w-8 h-8 text-red-500" />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold truncate">
              {resource.fileKey.split('/').pop()}
            </div>
            <div className="text-xs text-slate-500">
              {(resource.fileSize / 1024 / 1024).toFixed(2)} MB
            </div>
          </div>
        </div>
        <label className="flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-slate-300 rounded-lg cursor-pointer hover:border-primary-400 hover:bg-primary-50 transition">
          <input
            type="file"
            accept="application/pdf"
            onChange={handleFileChange}
            className="hidden"
            disabled={fileLoading}
          />
          {fileLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Upload className="w-4 h-4" />
          )}
          <span className="text-sm font-semibold">
            {fileLoading ? 'Envoi en cours...' : 'Remplacer par un autre PDF'}
          </span>
        </label>
        <p className="text-xs text-slate-500 mt-2">
          ⚠️ Le nouveau fichier sera en attente d'approbation avant d'être visible publiquement.
        </p>
      </div>

      {/* Title */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
        <h3 className="font-bold text-sm text-slate-700">📝 Métadonnées</h3>

        <Field label="Titre *" required>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="input"
            required
            minLength={5}
          />
        </Field>

        <Field label="Description">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="input min-h-[100px]"
            rows={4}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Type *">
            <select value={type} onChange={(e) => setType(e.target.value)} className="input">
              {TYPES.map((t) => (
                <option key={t.v} value={t.v}>
                  {t.l}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Matière *">
            <select
              value={subjectId}
              onChange={(e) => setSubjectId(e.target.value)}
              className="input"
              required
            >
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.icon} {s.nameFr}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Classe">
            <select
              value={classId}
              onChange={(e) => {
                setClassId(e.target.value);
                setSectionId('');
              }}
              className="input"
            >
              <option value="">— Aucune —</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nameFr}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Section">
            <select
              value={sectionId}
              onChange={(e) => setSectionId(e.target.value)}
              className="input"
              disabled={!classId}
            >
              <option value="">— Aucune —</option>
              {filteredSections.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nameFr}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <Field label="Trimestre">
            <select
              value={trimester}
              onChange={(e) => setTrimester(e.target.value)}
              className="input"
            >
              {TRIMESTERS.map((t) => (
                <option key={t.v} value={t.v}>
                  {t.l}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Année">
            <input
              type="text"
              value={year}
              onChange={(e) => setYear(e.target.value)}
              placeholder="2024"
              className="input"
            />
          </Field>
          <Field label="Langue">
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="input"
            >
              {LANGUAGES.map((l) => (
                <option key={l.v} value={l.v}>
                  {l.l}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="Tags (séparés par des virgules)">
          <input
            type="text"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="math, bac, 2024"
            className="input"
          />
        </Field>

        {/* Homework subtype + number — only when type=DEVOIR */}
        {type === 'DEVOIR' && (
          <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 space-y-3">
            <div className="font-bold text-amber-900 text-sm">📝 Détails du devoir</div>
            <div>
              <fieldset>
                <legend className="label mb-2">Type de devoir</legend>
              <div className="flex flex-wrap gap-2">
                {[
                  { value: 'CONTROLE', label: '📋 Contrôle', cls: 'red' },
                  { value: 'SYNTHESE', label: '📝 Synthèse', cls: 'violet' },
                  { value: 'MAISON', label: '🏠 Maison', cls: 'orange' },
                  { value: 'REVISION', label: '🔄 Révision', cls: 'blue' },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setHomeworkSubtype(opt.value)}
                    className={`px-3 py-2 rounded-lg text-sm font-bold border transition ${
                      homeworkSubtype === opt.value
                        ? opt.cls === 'red'
                          ? 'bg-red-100 border-red-400 text-red-800'
                          : opt.cls === 'violet'
                            ? 'bg-violet-100 border-violet-400 text-violet-800'
                            : 'bg-orange-100 border-orange-400 text-orange-800'
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              </fieldset>
            </div>
            <div>
              <label htmlFor="homeworkNumber" className="label">Numéro du devoir</label>
              <select id="homeworkNumber"
                value={homeworkNumber}
                onChange={(e) =>
                  setHomeworkNumber(e.target.value ? parseInt(e.target.value, 10) : '')
                }
                className="input"
              >
                <option value="">— Non spécifié —</option>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                  <option key={n} value={n}>
                    N°{n}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* School type */}
        <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
          <div className="font-bold text-slate-900 text-sm">🏫 Type d'école</div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setSchoolType('PUBLIC')}
              className={`flex-1 px-3 py-2 rounded-lg text-sm font-bold border transition ${
                schoolType === 'PUBLIC' || !schoolType
                  ? 'bg-slate-200 border-slate-400 text-slate-900'
                  : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              🏫 École publique
            </button>
            <button
              type="button"
              onClick={() => setSchoolType('PILOTE')}
              className={`flex-1 px-3 py-2 rounded-lg text-sm font-bold border transition ${
                schoolType === 'PILOTE'
                  ? 'bg-amber-200 border-amber-500 text-amber-900'
                  : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              🎓 Lycée/Collège Pilote
            </button>
          </div>
        </div>

        {/* Product (Technologie collège) */}
        {showProductField && (
          <div className="p-4 rounded-xl bg-orange-50 border border-orange-200 space-y-3">
            <div className="font-bold text-orange-900 text-sm">🔧 المنتج / Produit réalisé</div>
            <input
              type="text"
              value={product}
              onChange={(e) => setProduct(e.target.value)}
              className="input text-right"
              dir="rtl"
              placeholder="مثال: مطوية، برنامج سكراتش..."
              maxLength={200}
            />
          </div>
        )}

        {/* Correction */}
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 space-y-3">
          <label className="flex items-start gap-3 cursor-pointer" aria-label="Cette ressource contient un corrigé">
            <input
              type="checkbox"
              checked={hasCorrection}
              onChange={(e) => setHasCorrection(e.target.checked)}
              className="mt-1 w-5 h-5 rounded text-emerald-600"
            />
            <div>
              <div className="font-bold text-emerald-900 text-sm">
                ✅ Ce document contient un corrigé
              </div>
              <div className="text-xs text-emerald-700">Un badge vert proéminent sera affiché.</div>
            </div>
          </label>
          {hasCorrection && (
            <textarea
              value={correctionSummary}
              onChange={(e) => setCorrectionSummary(e.target.value)}
              className="input min-h-[60px] resize-none text-sm"
              placeholder="Description du corrigé..."
              maxLength={500}
            />
          )}
        </div>
      </div>

      {/* Submit */}
      <div className="flex items-center justify-end gap-3 sticky bottom-0 bg-slate-50 -mx-4 px-4 py-3 border-t border-slate-200">
        <Link
          href="/enseignant/ressources"
          className="px-4 py-2.5 rounded-lg border border-slate-200 font-semibold text-slate-700 hover:bg-white"
        >
          Annuler
        </Link>
        <button
          type="submit"
          disabled={loading}
          className="btn-primary inline-flex items-center gap-2"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Enregistrer les modifications
        </button>
      </div>
    </form>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="label">
        {label}
        {required && ' *'}
      </label>
      {children}
    </div>
  );
}
