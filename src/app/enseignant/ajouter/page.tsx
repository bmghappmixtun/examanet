'use client';
import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  Info,
  Loader2,
  Library,
  CheckCircle2,
  Upload,
  FileCheck,
  Sparkles,
  Calendar,
  BookOpen,
  GraduationCap,
  Layers,
  AlertCircle,
  CheckCircle,
} from 'lucide-react';
import toast from 'react-hot-toast';
import ModernUploader from '@/components/teacher/ModernUploader';
import { autoGenerateTags, autoGenerateTagsEnriched } from '@/lib/auto-tagger';
import {
  SCHOOL_YEARS,
  CLASSES,
  getSectionsForClass,
  isTroncCommun,
  getSubjectsForClassSection,
  FILE_TYPES,
  HOMEWORK_SUBTYPES,
  HOMEWORK_NUMBERS,
  EXERCISE_NUMBERS,
  SCHOOL_TYPES,
  type FileTypeKey,
  type SubjectOption,
} from '@/lib/teacher-workflow-data';

type UploadedFile = {
  libraryFileId: string;
  fileKey: string;
  fileUrl: string;
  fileSize: number;
  fileName: string;
  originalFormat: string;
  conversionStatus: string;
};

const COLOR_BG: Record<string, string> = {
  amber: 'bg-amber-100 text-amber-700',
  emerald: 'bg-emerald-100 text-emerald-700',
  violet: 'bg-violet-100 text-violet-700',
  sky: 'bg-sky-100 text-sky-700',
  slate: 'bg-slate-100 text-slate-700',
  red: 'bg-red-100 text-red-700',
  orange: 'bg-orange-100 text-orange-700',
  blue: 'bg-blue-100 text-blue-700',
};
const COLOR_RING: Record<string, string> = {
  amber: 'ring-amber-400 border-amber-400 bg-amber-50',
  emerald: 'ring-emerald-400 border-emerald-400 bg-emerald-50',
  violet: 'ring-violet-400 border-violet-400 bg-violet-50',
  sky: 'ring-sky-400 border-sky-400 bg-sky-50',
  slate: 'ring-slate-400 border-slate-400 bg-slate-50',
  red: 'bg-red-100 border-red-400 text-red-800',
  orange: 'bg-orange-100 border-orange-400 text-orange-800',
  blue: 'bg-blue-100 border-blue-400 text-blue-800',
};

export default function AddResourcePage() {
  const router = useRouter();
  const [resetKey, setResetKey] = useState(0);
  const [uploadedFile, setUploadedFile] = useState<UploadedFile | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Teacher info (for title generation)
  const [teacherName, setTeacherName] = useState<string>('');

  // Workflow state
  const [fileType, setFileType] = useState<FileTypeKey | ''>('');
  const [otherTypeLabel, setOtherTypeLabel] = useState<string>(''); // quand fileType=OTHER

  // Devoir-specific
  const [homeworkSubtype, setHomeworkSubtype] = useState<string>('');
  const [homeworkNumber, setHomeworkNumber] = useState<number | ''>('');

  // Série d'exercices specific
  const [exerciseNumber, setExerciseNumber] = useState<number | ''>('');

  // Course / Revision / Other title
  const [customTitle, setCustomTitle] = useState<string>('');

  // Common
  const [classSlug, setClassSlug] = useState<string>('');
  const [sectionSlug, setSectionSlug] = useState<string>('');
  const [subjectSlug, setSubjectSlug] = useState<string>('');
  const [schoolYear, setSchoolYear] = useState<string>('2025-2026');
  const [schoolType, setSchoolType] = useState<string>('PUBLIC');
  const [hasCorrection, setHasCorrection] = useState<boolean>(false);
  const [correctionSummary, setCorrectionSummary] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [tags, setTags] = useState<string>('');
  const [trimester, setTrimester] = useState<string>('');
  const [tagsManuallyEdited, setTagsManuallyEdited] = useState<boolean>(false);

  // Fetch teacher info on mount
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/auth/me');
        if (res.ok) {
          const data = await res.json();
          const u = data.user;
          if (u) {
            const fullName = `${u.firstName || ''} ${u.lastName || ''}`.trim();
            setTeacherName(fullName);
          }
        }
      } catch {
        // Silently fail — title will just not include teacher name
      }
    })();
  }, []);

  // Computed
  const sections = useMemo(() => getSectionsForClass(classSlug), [classSlug]);
  const subjects: SubjectOption[] = useMemo(
    () => getSubjectsForClassSection(classSlug, sectionSlug || null),
    [classSlug, sectionSlug],
  );
  const isTronc = isTroncCommun(classSlug);

  // Reset section when class changes
  useEffect(() => {
    setSectionSlug('');
  }, [classSlug]);
  // Reset subject when class or section changes
  useEffect(() => {
    setSubjectSlug('');
  }, [classSlug, sectionSlug]);

  // Auto-set trimester based on homework number (1=T1, 2=T2, 3+=T3)
  useEffect(() => {
    if (homeworkNumber === 1) setTrimester('T1');
    else if (homeworkNumber === 2) setTrimester('T2');
    else if (typeof homeworkNumber === 'number' && homeworkNumber >= 3) setTrimester('T3');
  }, [homeworkNumber]);

  // Auto-suggested SEO tags based on current form state
  const suggestedTags = useMemo(() => {
    if (!fileType || !subjectSlug || !classSlug) return [];
    // Use enriched version if user has filled in custom title/description (will include topic words)
    if (description && description.length > 20) {
      return autoGenerateTagsEnriched({
        title: customTitle || otherTypeLabel || 'Ressource',
        subjectSlug,
        classSlug,
        sectionSlug: sectionSlug || null,
        type: fileType,
        year: schoolYear,
        trimester: trimester || null,
        homeworkSubtype: fileType === 'DEVOIR' ? homeworkSubtype || null : null,
        homeworkNumber: fileType === 'DEVOIR' ? homeworkNumber || null : null,
        hasCorrection,
        description,
        summary: description, // Use description as summary
      });
    }
    return autoGenerateTags({
      title: customTitle || otherTypeLabel || 'Ressource',
      subjectSlug,
      classSlug,
      sectionSlug: sectionSlug || null,
      type: fileType,
      year: schoolYear,
      trimester: trimester || null,
      homeworkSubtype: fileType === 'DEVOIR' ? homeworkSubtype || null : null,
      homeworkNumber: fileType === 'DEVOIR' ? homeworkNumber || null : null,
      hasCorrection,
    });
  }, [
    fileType,
    subjectSlug,
    classSlug,
    sectionSlug,
    customTitle,
    otherTypeLabel,
    schoolYear,
    trimester,
    homeworkSubtype,
    homeworkNumber,
    hasCorrection,
  ]);

  // Auto-apply suggested tags if user hasn't manually edited them yet
  useEffect(() => {
    if (!tagsManuallyEdited && suggestedTags.length > 0) {
      // Add new suggestions to existing user tags
      const currentTags = tags
        ? tags
            .split(',')
            .map((t: string) => t.trim())
            .filter(Boolean)
        : [];
      const merged = Array.from(new Set([...currentTags, ...suggestedTags])).slice(0, 15);
      setTags(merged.join(', '));
    }
  }, [suggestedTags, tagsManuallyEdited]);

  // Build title automatically based on selections (or use custom title)
  // Format: [Type] [N°X] - [Objet/Sujet] - [Classe] - [Section] - [Année] - [Nom Prof]
  const generatedTitle = useMemo(() => {
    if (!fileType) return '';
    const parts: string[] = [];

    // 1) Type + sous-type / N°
    if (fileType === 'DEVOIR') {
      const sub = HOMEWORK_SUBTYPES.find((s) => s.key === homeworkSubtype);
      if (sub) {
        // Strip leading emoji: 📋📝🏠
        const cleanLabel = sub.label.replace(/^[\u{1F4CD}\u{1F4DD}\u{1F3E0}]\s*/u, '');
        parts.push(cleanLabel);
      }
      if (homeworkNumber) parts.push(`N°${homeworkNumber}`);
    } else if (fileType === 'EXERCISE') {
      parts.push("Série d'exercices");
      if (exerciseNumber) parts.push(`N°${exerciseNumber}`);
    } else if (fileType === 'COURSE') {
      parts.push('Cours');
    } else if (fileType === 'REVISION') {
      parts.push('Révision');
    } else if (fileType === 'OTHER') {
      if (otherTypeLabel) parts.push(otherTypeLabel);
    }

    // 2) Objet / Sujet (custom title) - pour série, cours, révision
    if (
      (fileType === 'EXERCISE' ||
        fileType === 'COURSE' ||
        fileType === 'REVISION' ||
        fileType === 'OTHER') &&
      customTitle
    ) {
      parts.push(`- ${customTitle}`);
    }

    // 3) Matière
    if (subjectSlug) {
      const subName = subjects.find((s) => s.slug === subjectSlug)?.name;
      if (subName) parts.push(`- ${subName}`);
    }

    // 4) Classe
    if (classSlug) {
      const className = CLASSES.find((c) => c.slug === classSlug)?.name;
      if (className) parts.push(`- ${className}`);
    }

    // 5) Section (si pas tronc commun)
    if (sectionSlug && !isTronc) {
      const sectionName = sections.find((s) => s.slug === sectionSlug)?.name;
      if (sectionName) parts.push(`- ${sectionName}`);
    }

    // 6) Année scolaire
    if (schoolYear) parts.push(`- ${schoolYear}`);

    // 7) Nom du prof
    if (teacherName) parts.push(`- ${teacherName}`);

    return parts.filter(Boolean).join(' ').trim();
  }, [
    fileType,
    homeworkSubtype,
    homeworkNumber,
    exerciseNumber,
    customTitle,
    otherTypeLabel,
    subjectSlug,
    classSlug,
    sectionSlug,
    schoolYear,
    teacherName,
    subjects,
    sections,
    isTronc,
  ]);

  // Validation per type
  const validation = useMemo(() => {
    const errors: string[] = [];
    if (!uploadedFile) errors.push('Uploadez un fichier');
    if (!fileType) errors.push('Choisissez le type de fichier');
    if (fileType === 'DEVOIR' && !homeworkSubtype) errors.push('Choisissez le type de devoir');
    if (fileType === 'EXERCISE' && !customTitle.trim())
      errors.push("Saisissez l'objet de la série");
    if ((fileType === 'COURSE' || fileType === 'REVISION') && !customTitle.trim())
      errors.push("Saisissez l'objet du cours/révision");
    if (fileType === 'OTHER' && !otherTypeLabel.trim()) errors.push('Précisez le type de fichier');
    if (!classSlug) errors.push('Choisissez la classe');
    if (!isTronc && sections.length > 0 && !sectionSlug) errors.push('Choisissez la section');
    if (!subjectSlug) errors.push('Choisissez la matière');
    return errors;
  }, [
    uploadedFile,
    fileType,
    homeworkSubtype,
    customTitle,
    otherTypeLabel,
    classSlug,
    sectionSlug,
    subjectSlug,
    isTronc,
    sections.length,
  ]);

  const canSubmit =
    validation.length === 0 && uploadedFile && uploadedFile.conversionStatus !== 'FAILED';

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) {
      toast.error(validation[0] || 'Formulaire incomplet');
      return;
    }
    setSubmitting(true);
    try {
      const finalTitle = generatedTitle || customTitle || otherTypeLabel || 'Sans titre';
      const res = await fetch('/api/teacher/resources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: finalTitle,
          description: description || null,
          type: fileType,
          subject: subjectSlug,
          class: classSlug,
          section: sectionSlug || '',
          trimester: trimester || null,
          year: schoolYear,
          tags: tags || null,
          // Library file
          libraryFileId: uploadedFile!.libraryFileId,
          fileKey: uploadedFile!.fileKey,
          fileUrl: uploadedFile!.fileUrl,
          fileSize: uploadedFile!.fileSize,
          // Homework
          homeworkSubtype: fileType === 'DEVOIR' ? homeworkSubtype || null : null,
          homeworkNumber: fileType === 'DEVOIR' && homeworkNumber ? Number(homeworkNumber) : null,
          // School
          schoolType,
          // Correction
          hasCorrection,
          correctionSummary: hasCorrection && correctionSummary ? correctionSummary : null,
        }),
      });
      const result = await res.json();
      if (!res.ok) {
        toast.error(result.error || 'Erreur');
        return;
      }
      toast.success("Ressource ajoutée et en attente d'approbation ! 🎉");
      setTimeout(() => router.push('/enseignant/ressources'), 1500);
    } catch (e) {
      toast.error('Erreur réseau');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-extrabold flex items-center gap-2">
          <Sparkles className="w-7 h-7 text-violet-600" />
          Ajouter une ressource
        </h1>
        <p className="text-slate-500 mt-1">
          Suivez le workflow — votre fichier sera automatiquement sauvegardé dans{' '}
          <a href="/enseignant/bibliotheque" className="text-violet-600 font-semibold underline">
            votre bibliothèque
          </a>
          .
        </p>
      </div>

      {/* ============================ STEP 0: FILE TYPE ============================ */}
      <Section step={1} title="Type de fichier" icon={<Layers className="w-4 h-4" />}>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {FILE_TYPES.map((ft) => {
            const active = fileType === ft.key;
            return (
              <button
                key={ft.key}
                type="button"
                onClick={() => {
                  setFileType(ft.key);
                  setOtherTypeLabel('');
                  setHomeworkSubtype('');
                  setHomeworkNumber('');
                  setExerciseNumber('');
                  setCustomTitle('');
                }}
                className={`p-4 rounded-2xl border-2 text-left transition ${
                  active
                    ? `${COLOR_RING[ft.color]} border-current ring-2`
                    : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                <div
                  className={`w-10 h-10 rounded-xl ${COLOR_BG[ft.color]} flex items-center justify-center text-xl mb-2`}
                >
                  {ft.icon}
                </div>
                <div className="font-bold text-slate-900 text-sm">{ft.label}</div>
                <div className="text-xs text-slate-500 mt-1 line-clamp-2">{ft.description}</div>
              </button>
            );
          })}
        </div>

        {/* Sub-flow: Devoir */}
        {fileType === 'DEVOIR' && (
          <SubSection title="📝 Détails du devoir" tone="amber">
            <div>
              <Label>
                Type de devoir <Required />
              </Label>
              <div className="flex flex-wrap gap-2">
                {HOMEWORK_SUBTYPES.map((opt) => (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => setHomeworkSubtype(opt.key)}
                    className={`px-4 py-2.5 rounded-lg text-sm font-bold border-2 transition ${
                      homeworkSubtype === opt.key
                        ? COLOR_RING[opt.color]
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            {homeworkSubtype && (
              <div>
                <Label>
                  Numéro du devoir{' '}
                  <span className="text-xs text-slate-400 font-normal">(optionnel)</span>
                </Label>
                <div className="flex flex-wrap gap-2">
                  {HOMEWORK_NUMBERS.map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setHomeworkNumber(n)}
                      className={`w-12 h-12 rounded-lg text-sm font-bold border-2 transition ${
                        homeworkNumber === n
                          ? 'ring-2 ring-violet-400 border-violet-400 bg-violet-50 text-violet-800'
                          : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      N°{n}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-slate-500 mt-2">
                  💡 Le numéro indique le trimestre (N°1 = T1, N°2 = T2, N°3+ = T3)
                </p>
              </div>
            )}
          </SubSection>
        )}

        {/* Sub-flow: Série d'exercices */}
        {fileType === 'EXERCISE' && (
          <SubSection title="✏️ Détails de la série" tone="emerald">
            <div>
              <Label>Numéro de série</Label>
              <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
                {EXERCISE_NUMBERS.map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setExerciseNumber(n)}
                    className={`w-12 h-12 rounded-lg text-sm font-bold border-2 transition ${
                      exerciseNumber === n
                        ? 'ring-2 ring-emerald-400 border-emerald-400 bg-emerald-50 text-emerald-800'
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    N°{n}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <Label>
                Objet / Titre de la série <Required />
              </Label>
              <input
                type="text"
                value={customTitle}
                onChange={(e) => setCustomTitle(e.target.value)}
                className="input"
                placeholder="Ex: Trigonométrie, Suites numériques, Les probabilités..."
              />
            </div>
          </SubSection>
        )}

        {/* Sub-flow: Cours */}
        {fileType === 'COURSE' && (
          <SubSection title="📚 Détails du cours" tone="violet">
            <div>
              <Label>
                Objet / Titre du cours <Required />
              </Label>
              <input
                type="text"
                value={customTitle}
                onChange={(e) => setCustomTitle(e.target.value)}
                className="input"
                placeholder="Ex: Chapitre 3 — Les fonctions exponentielles, Leçon n°5..."
              />
            </div>
          </SubSection>
        )}

        {/* Sub-flow: Révision */}
        {fileType === 'REVISION' && (
          <SubSection title="🔄 Détails de la révision" tone="sky">
            <div>
              <Label>
                Objet / Titre de la révision <Required />
              </Label>
              <input
                type="text"
                value={customTitle}
                onChange={(e) => setCustomTitle(e.target.value)}
                className="input"
                placeholder="Ex: Bac Blanc — Math, Fiche de révision Physique, Sujets types..."
              />
            </div>
          </SubSection>
        )}

        {/* Sub-flow: Autres */}
        {fileType === 'OTHER' && (
          <SubSection title="📦 Précisez le type" tone="slate">
            <div>
              <Label>
                Type de fichier <Required />
              </Label>
              <input
                type="text"
                value={otherTypeLabel}
                onChange={(e) => setOtherTypeLabel(e.target.value)}
                className="input"
                placeholder="Ex: Résumé de cours, Fiche méthode, Projet, Activité, Évaluation..."
              />
              <p className="text-xs text-slate-500 mt-2">
                💡 Décrivez en quelques mots ce que contient votre fichier
              </p>
            </div>
          </SubSection>
        )}
      </Section>

      {/* ============================ STEP 1: UPLOAD FILE ============================ */}
      <Section step={2} title="Uploader le fichier" icon={<Upload className="w-4 h-4" />}>
        <ModernUploader
          endpoint="/api/teacher/files/upload"
          fieldName="file"
          maxSizeMB={50}
          accept=".pdf,.docx,.doc,.odt"
          formFields={{}}
          resetKey={resetKey}
          onSuccess={(data) => {
            if (data.success && data.libraryFileId) {
              setUploadedFile({
                libraryFileId: data.libraryFileId,
                fileKey: data.pdfKey || data.fileKey,
                fileUrl: data.pdfUrl || data.fileUrl,
                fileSize: data.file?.fileSize || 0,
                fileName: data.file?.fileName || 'fichier',
                originalFormat: data.originalFormat,
                conversionStatus: data.conversionStatus,
              });
              if (data.conversionStatus === 'FAILED') {
                toast.error('⚠️ Conversion PDF échouée. Ré-uploadez en PDF.');
              } else if (data.originalFormat !== 'pdf' && data.conversionStatus === 'SUCCESS') {
                toast.success('📄 Fichier Word converti en PDF !');
              } else {
                toast.success('📄 Fichier uploadé !');
              }
            }
          }}
          onError={(err) => {
            toast.error('Erreur upload: ' + (typeof err === 'string' ? err : 'inconnue'));
          }}
        />
        {uploadedFile && uploadedFile.conversionStatus !== 'FAILED' && (
          <div className="mt-3 p-3 rounded-lg bg-blue-50 border border-blue-200 flex items-start gap-2">
            <Library className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-blue-800">
              <strong>Original sauvegardé.</strong> Vous retrouverez{' '}
              <span className="font-mono text-xs">{uploadedFile.fileName}</span> dans votre{' '}
              <a href="/enseignant/bibliotheque" className="font-bold underline">
                bibliothèque
              </a>
              .
            </div>
          </div>
        )}
      </Section>

      {/* ============================ STEP 2: CLASSE / SECTION / MATIÈRE ============================ */}
      <Section
        step={3}
        title="Classe, section & matière"
        icon={<GraduationCap className="w-4 h-4" />}
      >
        <div className="space-y-4">
          <div>
            <Label>
              Classe <Required />
            </Label>
            <select
              value={classSlug}
              onChange={(e) => setClassSlug(e.target.value)}
              className="input"
            >
              <option value="">— Choisir une classe —</option>
              <optgroup label="Collège">
                {CLASSES.filter((c) => c.level === 'college').map((c) => (
                  <option key={c.slug} value={c.slug}>
                    {c.name}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Lycée">
                {CLASSES.filter((c) => c.level === 'lycee').map((c) => (
                  <option key={c.slug} value={c.slug}>
                    {c.name}
                  </option>
                ))}
              </optgroup>
            </select>
          </div>

          {classSlug && (
            <>
              {isTronc ? (
                <div className="p-3 rounded-lg bg-violet-50 border border-violet-200 flex items-start gap-2">
                  <Info className="w-4 h-4 text-violet-600 flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-violet-800">
                    <strong>{CLASSES.find((c) => c.slug === classSlug)?.name}</strong> est un tronc
                    commun — toutes les matières sont enseignées à tous les élèves, sans distinction
                    de section.
                  </div>
                </div>
              ) : (
                <div>
                  <Label>
                    Section <Required />
                  </Label>
                  <select
                    value={sectionSlug}
                    onChange={(e) => setSectionSlug(e.target.value)}
                    className="input"
                  >
                    <option value="">— Choisir une section —</option>
                    {sections.map((s) => (
                      <option key={s.slug} value={s.slug}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </>
          )}

          {classSlug && (isTronc || sectionSlug) && (
            <div>
              <Label>
                Matière <Required />
              </Label>
              <select
                value={subjectSlug}
                onChange={(e) => setSubjectSlug(e.target.value)}
                className="input"
              >
                <option value="">— Choisir une matière —</option>
                {subjects.map((s) => (
                  <option key={s.slug} value={s.slug}>
                    {s.name}
                  </option>
                ))}
              </select>
              {subjects.length === 0 && (
                <p className="text-xs text-amber-600 mt-1">
                  ⚠️ Aucune matière disponible pour cette combinaison
                </p>
              )}
            </div>
          )}
        </div>
      </Section>

      {/* ============================ STEP 3: ANNÉE + ÉCOLE ============================ */}
      <Section step={4} title="Année scolaire & école" icon={<Calendar className="w-4 h-4" />}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label>
              Année scolaire <Required />
            </Label>
            <select
              value={schoolYear}
              onChange={(e) => setSchoolYear(e.target.value)}
              className="input"
            >
              {SCHOOL_YEARS.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>
              Trimestre <span className="text-xs text-slate-400 font-normal">(optionnel)</span>
            </Label>
            <select
              value={trimester}
              onChange={(e) => setTrimester(e.target.value)}
              className="input"
            >
              <option value="">— Non spécifié —</option>
              <option value="T1">1er trimestre</option>
              <option value="T2">2ème trimestre</option>
              <option value="T3">3ème trimestre</option>
            </select>
          </div>
        </div>
        <div className="mt-4">
          <Label>Type d'école</Label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {SCHOOL_TYPES.map((st) => {
              const active = schoolType === st.key;
              return (
                <button
                  key={st.key}
                  type="button"
                  onClick={() => setSchoolType(st.key)}
                  className={`p-4 rounded-xl border-2 text-left transition ${
                    active
                      ? `${COLOR_RING[st.color]} border-current ring-2`
                      : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">{st.icon}</span>
                    <span className="font-bold text-slate-900 text-sm">{st.label}</span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1.5">{st.description}</p>
                </button>
              );
            })}
          </div>
        </div>
      </Section>

      {/* ============================ STEP 4: OPTIONNEL ============================ */}
      <Section step={5} title="Détails optionnels" icon={<Info className="w-4 h-4" />}>
        <div>
          <Label>
            Description <span className="text-xs text-slate-400 font-normal">(optionnel)</span>
          </Label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="input min-h-[80px] resize-none"
            placeholder="Décrivez votre ressource..."
            maxLength={500}
          />
        </div>
        <div>
          <Label>
            Tags{' '}
            <span className="text-xs text-slate-400 font-normal">
              (séparés par des virgules — suggestions automatiques)
            </span>
          </Label>
          <input
            type="text"
            value={tags}
            onChange={(e) => {
              setTags(e.target.value);
              setTagsManuallyEdited(true);
            }}
            className="input"
            placeholder="math, bac, 2024, fonction"
          />
          {suggestedTags.length > 0 && (
            <div className="mt-2">
              <div className="text-xs text-slate-500 mb-1.5 flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-violet-500" />
                <span>
                  {tagsManuallyEdited
                    ? 'Suggestions (cliquez pour ajouter)'
                    : 'Auto-générés depuis le formulaire'}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {suggestedTags.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => {
                      const current = tags
                        ? tags
                            .split(',')
                            .map((s: string) => s.trim())
                            .filter(Boolean)
                        : [];
                      if (!current.includes(t)) {
                        setTags([...current, t].join(', '));
                        setTagsManuallyEdited(true);
                      }
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-violet-50 text-violet-700 border border-violet-200 hover:bg-violet-100 transition"
                  >
                    + {t}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Correction checkbox */}
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 space-y-3">
          <label className="flex items-start gap-3 cursor-pointer" aria-label="Cette ressource contient un corrigé">
            <input
              type="checkbox"
              checked={hasCorrection}
              onChange={(e) => setHasCorrection(e.target.checked)}
              className="mt-1 w-5 h-5 rounded text-emerald-600 focus:ring-emerald-500"
            />
            <div className="flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <CheckCircle2 className="w-5 h-5 text-emerald-700" />
                <span className="font-bold text-emerald-900">Ce document contient un corrigé</span>
                <span className="text-xs bg-emerald-200 text-emerald-800 px-2 py-0.5 rounded-full font-bold">
                  Très recherché 🔥
                </span>
              </div>
              <p className="text-xs text-emerald-700 mt-1">
                Cochez si votre PDF inclut le corrigé détaillé. Un badge vert proéminent sera
                affiché.
              </p>
            </div>
          </label>
          {hasCorrection && (
            <div>
              <Label>Description du corrigé</Label>
              <textarea
                value={correctionSummary}
                onChange={(e) => setCorrectionSummary(e.target.value)}
                className="input min-h-[60px] resize-none text-sm"
                placeholder="Ex: Corrigé détaillé des exercices 1 à 4 avec barème..."
                maxLength={500}
              />
            </div>
          )}
        </div>
      </Section>

      {/* ============================ STEP 5: TITRE GÉNÉRÉ + PREVIEW + PUBLIER ============================ */}
      <form onSubmit={handleSubmit}>
        <Section step={6} title="Aperçu & publication" icon={<FileCheck className="w-4 h-4" />}>
          {/* Title preview */}
          {generatedTitle && (
            <div className="p-4 rounded-xl bg-gradient-to-br from-violet-50 to-amber-50 border-2 border-violet-200">
              <div className="text-xs font-bold text-violet-600 uppercase tracking-wide mb-1">
                📋 Titre généré
              </div>
              <div className="text-lg font-bold text-slate-900">{generatedTitle}</div>
              <div className="mt-2 flex flex-wrap gap-2 text-xs">
                {subjectSlug && (
                  <span className="inline-flex items-center gap-1 bg-white border border-violet-200 rounded-full px-2.5 py-1 text-violet-700">
                    <BookOpen className="w-3 h-3" />
                    {subjects.find((s) => s.slug === subjectSlug)?.name}
                  </span>
                )}
                {classSlug && (
                  <span className="inline-flex items-center gap-1 bg-white border border-violet-200 rounded-full px-2.5 py-1 text-violet-700">
                    <GraduationCap className="w-3 h-3" />
                    {CLASSES.find((c) => c.slug === classSlug)?.name}
                  </span>
                )}
                {sectionSlug && (
                  <span className="inline-flex items-center gap-1 bg-white border border-violet-200 rounded-full px-2.5 py-1 text-violet-700">
                    <Layers className="w-3 h-3" />
                    {sections.find((s) => s.slug === sectionSlug)?.name}
                  </span>
                )}
                <span className="inline-flex items-center gap-1 bg-white border border-violet-200 rounded-full px-2.5 py-1 text-violet-700">
                  <Calendar className="w-3 h-3" />
                  {schoolYear}
                </span>
                {trimester && (
                  <span className="inline-flex items-center gap-1 bg-white border border-violet-200 rounded-full px-2.5 py-1 text-violet-700">
                    {trimester}
                  </span>
                )}
                {hasCorrection && (
                  <span className="inline-flex items-center gap-1 bg-emerald-100 border border-emerald-300 rounded-full px-2.5 py-1 text-emerald-700">
                    <CheckCircle2 className="w-3 h-3" />
                    Avec corrigé
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Validation errors */}
          {validation.length > 0 && (
            <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 space-y-1.5">
              <div className="flex items-center gap-2 text-amber-900 font-bold text-sm">
                <AlertCircle className="w-4 h-4" />
                Pour finaliser, complétez :
              </div>
              <ul className="text-sm text-amber-800 space-y-0.5 pl-6 list-disc">
                {validation.slice(0, 5).map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Submit row */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 flex items-center justify-between gap-4 flex-wrap">
            <div className="text-sm text-slate-500">
              {uploadedFile ? (
                uploadedFile.conversionStatus === 'FAILED' ? (
                  <span className="text-amber-700">⚠️ Conversion échouée. Ré-uploadez en PDF.</span>
                ) : (
                  <span>
                    ✅ Fichier{' '}
                    <span className="font-bold text-slate-900">{uploadedFile.fileName}</span> prêt
                    {uploadedFile.originalFormat !== 'pdf' && (
                      <span className="ml-1 text-blue-600">
                        (original {uploadedFile.originalFormat.toUpperCase()})
                      </span>
                    )}
                  </span>
                )
              ) : (
                <span>⚠️ Uploadez d'abord un fichier à l'étape 2</span>
              )}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setUploadedFile(null);
                  setResetKey((k) => k + 1);
                }}
                className="px-4 py-2.5 rounded-lg border border-slate-200 font-semibold text-slate-700 hover:bg-slate-50"
              >
                Réinitialiser fichier
              </button>
              <button
                type="submit"
                disabled={submitting || !canSubmit}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 text-white font-bold shadow-lg hover:shadow-xl hover:scale-[1.02] transition disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Publication...
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-4 h-4" /> Publier la ressource
                  </>
                )}
              </button>
            </div>
          </div>
        </Section>
      </form>
    </div>
  );
}

// ============================================================================
// UI HELPERS
// ============================================================================
function Section({
  step,
  title,
  icon,
  children,
}: {
  step: number;
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <span className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-600 to-purple-600 text-white font-extrabold text-sm flex items-center justify-center shadow-md">
          {step}
        </span>
        <h2 className="font-bold text-lg flex items-center gap-1.5">
          {icon}
          {title}
        </h2>
      </div>
      <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">{children}</div>
    </div>
  );
}

function SubSection({
  title,
  tone,
  children,
}: {
  title: string;
  tone: string;
  children: React.ReactNode;
}) {
  const toneClass: Record<string, string> = {
    amber: 'bg-amber-50 border-amber-200',
    emerald: 'bg-emerald-50 border-emerald-200',
    violet: 'bg-violet-50 border-violet-200',
    sky: 'bg-sky-50 border-sky-200',
    slate: 'bg-slate-50 border-slate-200',
  };
  return (
    <div className={`p-4 rounded-xl border ${toneClass[tone] || toneClass.slate} space-y-3`}>
      <div className="font-bold text-sm text-slate-900">{title}</div>
      {children}
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <label className="block text-sm font-semibold text-slate-700 mb-1.5">{children}</label>;
}

function Required() {
  return <span className="text-red-500">*</span>;
}
