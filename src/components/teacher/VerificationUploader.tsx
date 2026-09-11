'use client';

/**
 * 2026-09-11: Rebuilt verification uploader from scratch.
 *
 * Goals:
 * - Teacher can SELECT UP TO 5 FILES AT ONCE (multi-file input)
 * - Or drag/drop multiple files
 * - Per-file metadata (type, year, description) before send
 * - Upload all in parallel
 * - Per-file progress + per-file error reporting
 * - Robust to schema/import issues (no implicit assumptions)
 *
 * Props contract matches what /enseignant/verification/page.tsx passes:
 * - initialFiles, initialRemaining, initialStatus, initialRequestedAt, initialReceivedAt, note
 */

import { useState, useRef, useCallback } from 'react';
import {
  Upload,
  X,
  CheckCircle,
  Loader2,
  AlertCircle,
  Download,
  Trash2,
} from 'lucide-react';
import toast from 'react-hot-toast';

// ---------- Types ----------

type ExistingFile = {
  id: string;
  fileName: string;
  originalFormat: string | null;
  fileSize: number | null;
  fileUrl: string;
  type: string | null;
  description: string | null;
  year: string | null;
  uploadedAt: string;
  reviewedByAdmin: boolean;
};

type PendingItem = {
  uid: string;
  file: File;
  type: string;
  year: string;
  description: string;
  status: 'idle' | 'uploading' | 'success' | 'error';
  errorMessage?: string;
  resultId?: string;
};

type Props = {
  initialFiles: ExistingFile[];
  initialRemaining: number;
  initialStatus: string;
  initialRequestedAt: string | null;
  initialReceivedAt: string | null;
  note: string | null;
};

// ---------- Constants ----------

const FILE_TYPES: { value: string; label: string }[] = [
  { value: 'COURSE', label: '📚 Cours' },
  { value: 'DEVOIR', label: '📝 Devoir' },
  { value: 'EXERCISE', label: "✏️ Série d'exercices" },
  { value: 'REVISION', label: '🔄 Révision' },
  { value: 'EXAM', label: '📋 Examen / Contrôle' },
  { value: 'BAC_SUBJECT', label: '🎓 Sujet Bac' },
  { value: 'CORRECTION', label: '✅ Corrigé' },
  { value: 'OTHER', label: '📁 Autre' },
];

const ALLOWED_EXT = ['docx', 'doc', 'pdf'];
const ALLOWED_MIME = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];
const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB

// ---------- Helpers ----------

function formatSize(bytes: number | null | undefined): string {
  const n = bytes || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function uid(): string {
  return `p${Date.now()}${Math.random().toString(36).slice(2, 8)}`;
}

function isValidFile(file: File): { ok: true } | { ok: false; reason: string } {
  if (file.size > MAX_FILE_SIZE) {
    return { ok: false, reason: `Trop volumineux (max 25 MB)` };
  }
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  if (!ALLOWED_EXT.includes(ext) && !ALLOWED_MIME.includes(file.type)) {
    return { ok: false, reason: 'Format non supporté (.docx, .doc, .pdf uniquement)' };
  }
  return { ok: true };
}

function defaultTypeFor(file: File): string {
  const lower = file.name.toLowerCase();
  if (lower.includes('cours') || lower.includes('chapitre')) return 'COURSE';
  if (lower.includes('devoir') || lower.includes('ds')) return 'DEVOIR';
  if (lower.includes('serie') || lower.includes('exercice')) return 'EXERCISE';
  if (lower.includes('revision')) return 'REVISION';
  if (lower.includes('examen') || lower.includes('controle') || lower.includes('bac')) return 'BAC_SUBJECT';
  if (lower.includes('corrige')) return 'CORRECTION';
  return 'OTHER';
}

// ---------- Component ----------

export default function VerificationUploader({
  initialFiles,
  initialRemaining,
  initialStatus,
  initialRequestedAt,
  initialReceivedAt,
  note,
}: Props) {
  const [files, setFiles] = useState<ExistingFile[]>(initialFiles || []);
  const [pending, setPending] = useState<PendingItem[]>([]);
  const [remaining, setRemaining] = useState<number>(initialRemaining);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const totalUploaded = files.length;
  const allUploaded = totalUploaded >= 5;
  const canAddMore = !allUploaded && remaining > 0;
  const isUploading = pending.some((p) => p.status === 'uploading');
  const hasErrors = pending.some((p) => p.status === 'error');

  // ---------- Add files ----------

  const addFiles = useCallback(
    (fileList: FileList | File[]) => {
      if (!canAddMore) {
        toast.error('Vous avez déjà 5 fichiers. Limite atteinte.');
        return;
      }
      const incoming = Array.from(fileList);
      const valid: PendingItem[] = [];
      const rejected: string[] = [];

      for (const f of incoming) {
        const check = isValidFile(f);
        if (!check.ok) {
          rejected.push(`${f.name}: ${check.reason}`);
          continue;
        }
        const slotsLeft = 5 - totalUploaded - pending.length - valid.length;
        if (slotsLeft <= 0) {
          rejected.push(`${f.name}: limite de 5 fichiers atteinte`);
          break;
        }
        valid.push({
          uid: uid(),
          file: f,
          type: defaultTypeFor(f),
          year: new Date().getFullYear().toString(),
          description: '',
          status: 'idle',
        });
      }

      if (valid.length === 0) {
        if (rejected.length > 0) toast.error(rejected[0]);
        return;
      }

      setPending((prev) => [...prev, ...valid]);
      if (rejected.length > 0) {
        toast.error(`${rejected.length} fichier(s) rejeté(s): ${rejected[0]}`);
      } else {
        toast.success(`${valid.length} fichier(s) prêt(s) à envoyer`);
      }
    },
    [canAddMore, pending.length, totalUploaded],
  );

  function onFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files && e.target.files.length > 0) {
      addFiles(e.target.files);
      e.target.value = '';
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      addFiles(e.dataTransfer.files);
    }
  }

  function onDragOver(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(true);
  }

  function onDragLeave(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
  }

  // ---------- Edit / remove pending ----------

  function updatePending(uid: string, patch: Partial<PendingItem>) {
    setPending((prev) => prev.map((p) => (p.uid === uid ? { ...p, ...patch } : p)));
  }

  function removePending(uid: string) {
    setPending((prev) => prev.filter((p) => p.uid !== uid));
  }

  function clearAllPending() {
    if (pending.length === 0) return;
    if (isUploading) return;
    setPending([]);
  }

  // ---------- Upload ----------

  async function uploadOne(item: PendingItem): Promise<{ ok: boolean; id?: string; error?: string }> {
    try {
      const fd = new FormData();
      fd.append('file', item.file);
      fd.append('type', item.type);
      fd.append('description', item.description);
      fd.append('year', item.year);

      const res = await fetch('/api/teacher/verification-files', {
        method: 'POST',
        body: fd,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        return { ok: false, error: data.error || `Erreur ${res.status}` };
      }
      return { ok: true, id: data.id };
    } catch (e: any) {
      return { ok: false, error: e?.message || 'Erreur réseau' };
    }
  }

  async function refresh() {
    try {
      const res = await fetch('/api/teacher/verification-files');
      const data = await res.json().catch(() => ({}));
      if (Array.isArray(data.files)) setFiles(data.files);
      if (typeof data.request?.remaining === 'number') setRemaining(data.request.remaining);
    } catch {
      // silent
    }
  }

  async function uploadAll() {
    const idle = pending.filter((p) => p.status === 'idle' || p.status === 'error');
    if (idle.length === 0) return;

    setPending((prev) => prev.map((p) => (p.status === 'idle' || p.status === 'error' ? { ...p, status: 'uploading', errorMessage: undefined } : p)));

    // Run sequentially to avoid overwhelming the server
    let successCount = 0;
    let errorCount = 0;
    for (const item of idle) {
      const result = await uploadOne(item);
      setPending((prev) =>
        prev.map((p) =>
          p.uid === item.uid
            ? result.ok
              ? { ...p, status: 'success', resultId: result.id }
              : { ...p, status: 'error', errorMessage: result.error }
            : p,
        ),
      );
      if (result.ok) successCount++;
      else errorCount++;
    }

    if (successCount > 0) {
      toast.success(`${successCount} fichier(s) envoyé(s) !`);
      await refresh();
    }
    if (errorCount > 0) {
      toast.error(`${errorCount} fichier(s) ont échoué`);
    }
  }

  function retryFailed() {
    setPending((prev) => prev.map((p) => (p.status === 'error' ? { ...p, status: 'idle', errorMessage: undefined } : p)));
  }

  // ---------- Delete existing ----------

  async function deleteFile(id: string) {
    if (!confirm('Supprimer ce fichier ?')) return;
    try {
      const res = await fetch(`/api/teacher/verification-files?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || 'Erreur');
        return;
      }
      toast.success('Fichier supprimé');
      setFiles((prev) => prev.filter((f) => f.id !== id));
      setRemaining((r) => r + 1);
    } catch {
      toast.error('Erreur réseau');
    }
  }

  // ---------- Render ----------

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-white border border-slate-200 rounded-xl p-4 text-center">
          <div className="text-3xl font-extrabold text-violet-700">
            {totalUploaded}/5
          </div>
          <div className="text-xs text-slate-500 font-semibold uppercase mt-1">
            Fichiers reçus
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4 text-center">
          <div className="text-3xl font-extrabold text-slate-700">{remaining}</div>
          <div className="text-xs text-slate-500 font-semibold uppercase mt-1">
            Restants
          </div>
        </div>
        <div
          className={`border rounded-xl p-4 text-center ${
            allUploaded
              ? 'bg-emerald-50 border-emerald-200'
              : 'bg-amber-50 border-amber-200'
          }`}
        >
          <div
            className={`text-3xl font-extrabold ${
              allUploaded ? 'text-emerald-700' : 'text-amber-700'
            }`}
          >
            {allUploaded ? '✓' : '⏱️'}
          </div>
          <div
            className={`text-xs font-semibold uppercase mt-1 ${
              allUploaded ? 'text-emerald-600' : 'text-amber-600'
            }`}
          >
            {allUploaded ? 'Complet' : 'En cours'}
          </div>
        </div>
      </div>

      {/* Admin note */}
      {note && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <div className="font-bold text-amber-900 text-sm mb-1">
            📝 Message de l&apos;équipe :
          </div>
          <p className="text-sm text-amber-800 whitespace-pre-line">{note}</p>
        </div>
      )}

      {/* Already uploaded list */}
      {files.length > 0 && (
        <div className="space-y-2">
          <h3 className="font-bold text-slate-900">
            ✅ Fichiers déjà envoyés ({files.length})
          </h3>
          {files.map((f) => (
            <div
              key={f.id}
              className="bg-white border border-slate-200 rounded-xl p-4 flex items-start gap-3"
            >
              <div
                className={`w-10 h-12 rounded-lg flex items-center justify-center flex-shrink-0 ${
                  (f.originalFormat || '').toLowerCase() === 'pdf'
                    ? 'bg-red-100 text-red-600'
                    : 'bg-blue-100 text-blue-600'
                }`}
              >
                📄
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-sm text-slate-900 truncate">
                  {f.fileName}
                </div>
                <div className="flex flex-wrap gap-3 mt-1 text-xs text-slate-500">
                  <span>{formatSize(f.fileSize)}</span>
                  <span>
                    {FILE_TYPES.find((t) => t.value === f.type)?.label || f.type}
                  </span>
                  {f.year && <span>📅 {f.year}</span>}
                  <span>
                    Envoyé le {new Date(f.uploadedAt).toLocaleDateString('fr-FR')}
                  </span>
                  {f.reviewedByAdmin && (
                    <span className="text-emerald-600 font-semibold">
                      ✓ Validé
                    </span>
                  )}
                </div>
                {f.description && (
                  <p className="text-xs text-slate-600 mt-1 line-clamp-2">
                    {f.description}
                  </p>
                )}
              </div>
              <div className="flex gap-1">
                <a
                  href={f.fileUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="p-2 text-slate-500 hover:text-violet-600 hover:bg-violet-50 rounded-lg transition"
                  title="Télécharger"
                >
                  <Download className="w-4 h-4" />
                </a>
                {!f.reviewedByAdmin && (
                  <button
                    onClick={() => deleteFile(f.id)}
                    className="p-2 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                    title="Supprimer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Completion message */}
      {allUploaded && (
        <div className="bg-gradient-to-br from-emerald-50 to-white border-2 border-emerald-200 rounded-2xl p-8 text-center">
          <div className="text-6xl mb-3">🎉</div>
          <h3 className="text-2xl font-extrabold text-emerald-800 mb-2">
            Tous vos fichiers ont été reçus !
          </h3>
          <p className="text-sm text-emerald-700">
            Notre équipe examine vos documents. Vous recevrez un email dès la
            décision.
          </p>
        </div>
      )}

      {/* Drop zone - only if can add more */}
      {canAddMore && (
        <div
          onDrop={onDrop}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition ${
            dragOver
              ? 'border-violet-500 bg-violet-50'
              : 'border-slate-300 hover:border-violet-400 hover:bg-slate-50'
          }`}
        >
          <Upload className="w-12 h-12 mx-auto text-slate-400 mb-3" />
          <h3 className="font-bold text-slate-900 mb-1">
            Glissez vos fichiers ici
          </h3>
          <p className="text-sm text-slate-500">
            ou cliquez pour parcourir —{' '}
            <span className="font-semibold">
              sélectionnez jusqu&apos;à {remaining} fichier(s) en une fois
            </span>
            <br />
            Formats acceptés : .docx, .doc, .pdf (max 25 MB par fichier)
          </p>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".docx,.doc,.pdf,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            onChange={onFileInputChange}
            className="hidden"
          />
        </div>
      )}

      {/* Pending files (metadata + upload) */}
      {pending.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-slate-900">
              📦 Fichiers à envoyer ({pending.length})
            </h3>
            <div className="flex gap-2">
              {hasErrors && !isUploading && (
                <button
                  onClick={retryFailed}
                  className="text-xs text-violet-600 hover:text-violet-800 font-semibold"
                >
                  🔄 Réessayer les échecs
                </button>
              )}
              {!isUploading && (
                <button
                  onClick={clearAllPending}
                  className="text-xs text-slate-500 hover:text-slate-700 font-semibold"
                >
                  Tout vider
                </button>
              )}
            </div>
          </div>

          {pending.map((p) => (
            <PendingFileCard
              key={p.uid}
              item={p}
              onChange={(patch) => updatePending(p.uid, patch)}
              onRemove={() => removePending(p.uid)}
            />
          ))}

          <button
            onClick={uploadAll}
            disabled={isUploading || pending.every((p) => p.status === 'success')}
            className="w-full bg-violet-600 hover:bg-violet-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-bold py-3 px-6 rounded-xl transition flex items-center justify-center gap-2"
          >
            {isUploading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Envoi en cours...
              </>
            ) : (
              <>
                <Upload className="w-5 h-5" />
                Envoyer {pending.filter((p) => p.status === 'idle' || p.status === 'error').length} fichier(s)
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}

// ---------- Pending file card ----------

function PendingFileCard({
  item,
  onChange,
  onRemove,
}: {
  item: PendingItem;
  onChange: (patch: Partial<PendingItem>) => void;
  onRemove: () => void;
}) {
  const isUploading = item.status === 'uploading';
  const isSuccess = item.status === 'success';
  const isError = item.status === 'error';

  return (
    <div
      className={`bg-white border-2 rounded-xl p-4 ${
        isError
          ? 'border-red-200 bg-red-50'
          : isSuccess
            ? 'border-emerald-200 bg-emerald-50'
            : 'border-slate-200'
      }`}
    >
      <div className="flex items-start gap-3">
        <div className="w-10 h-12 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
          📄
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="font-bold text-sm text-slate-900 truncate">
              {item.file.name}
            </div>
            <div className="flex items-center gap-2">
              {isUploading && (
                <Loader2 className="w-4 h-4 text-violet-600 animate-spin" />
              )}
              {isSuccess && <CheckCircle className="w-4 h-4 text-emerald-600" />}
              {isError && <AlertCircle className="w-4 h-4 text-red-600" />}
              <button
                onClick={onRemove}
                disabled={isUploading}
                className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition disabled:opacity-30"
                title="Retirer de la liste"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
          <div className="text-xs text-slate-500 mt-1">
            {formatSize(item.file.size)} •{' '}
            {(item.file.name.split('.').pop() || '').toUpperCase()}
          </div>

          {isError && item.errorMessage && (
            <div className="mt-2 text-xs text-red-700 bg-red-100 border border-red-200 rounded-lg px-2 py-1">
              ⚠️ {item.errorMessage}
            </div>
          )}
          {isSuccess && (
            <div className="mt-2 text-xs text-emerald-700 bg-emerald-100 border border-emerald-200 rounded-lg px-2 py-1">
              ✅ Envoyé avec succès
            </div>
          )}

          {/* Metadata fields */}
          <div className="grid grid-cols-2 gap-2 mt-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Type *
              </label>
              <select
                value={item.type}
                onChange={(e) => onChange({ type: e.target.value })}
                disabled={isUploading || isSuccess}
                className="w-full px-2 py-1.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500 disabled:bg-slate-100"
              >
                {FILE_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Année
              </label>
              <input
                type="text"
                value={item.year}
                onChange={(e) => onChange({ year: e.target.value })}
                disabled={isUploading || isSuccess}
                placeholder="2026"
                className="w-full px-2 py-1.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500 disabled:bg-slate-100"
              />
            </div>
          </div>
          <div className="mt-2">
            <label className="block text-xs font-semibold text-slate-600 mb-1">
              Description (optionnel)
            </label>
            <input
              type="text"
              value={item.description}
              onChange={(e) => onChange({ description: e.target.value })}
              disabled={isUploading || isSuccess}
              placeholder="Ex: Cours complet sur les intégrales pour 4ème Math"
              maxLength={300}
              className="w-full px-2 py-1.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500 disabled:bg-slate-100"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
