'use client';

import { useState, useRef } from 'react';
import {
  Upload,
  FileText,
  X,
  CheckCircle,
  Loader2,
  AlertCircle,
  Download,
  Trash2,
  FileCheck,
} from 'lucide-react';
import toast from 'react-hot-toast';

type VerificationFile = {
  id: string;
  fileName: string;
  originalFormat: string;
  fileUrl: string;
  fileSize: number;
  type: string | null;
  description: string | null;
  year: string | null;
  uploadedAt: string;
  reviewedByAdmin: boolean;
};

type Props = {
  initialFiles: VerificationFile[];
  initialRemaining: number;
  initialRequestedAt: string | null;
  initialReceivedAt: string | null;
  initialStatus: string;
  note: string | null;
};

const FILE_TYPES = [
  { value: 'COURSE', label: '📚 Cours' },
  { value: 'DEVOIR', label: '📝 Devoir' },
  { value: 'EXERCISE', label: "✏️ Série d'exercices" },
  { value: 'REVISION', label: '🔄 Révision' },
  { value: 'EXAM', label: '📋 Examen / Contrôle' },
  { value: 'BAC_SUBJECT', label: '🎓 Sujet Bac' },
  { value: 'CORRECTION', label: '✅ Corrigé' },
  { value: 'OTHER', label: '📁 Autre' },
];

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function VerificationFilesUploader({
  initialFiles,
  initialRemaining,
  initialRequestedAt,
  initialReceivedAt,
  initialStatus,
  note,
}: Props) {
  const [files, setFiles] = useState(initialFiles);
  const [remaining, setRemaining] = useState(initialRemaining);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingType, setPendingType] = useState('COURSE');
  const [pendingDesc, setPendingDesc] = useState('');
  const [pendingYear, setPendingYear] = useState(new Date().getFullYear().toString());
  const fileInputRef = useRef<HTMLInputElement>(null);

  const totalUploaded = files.length;
  const allUploaded = remaining === 0;
  const isOld =
    initialRequestedAt &&
    (Date.now() - new Date(initialRequestedAt).getTime()) / (1000 * 60 * 60 * 24) > 7;

  function handleFileSelect(f: File | null) {
    if (!f) return;
    if (f.size > 25 * 1024 * 1024) {
      toast.error('Fichier trop volumineux (max 25 MB)');
      return;
    }
    const ext = (f.name.split('.').pop() || '').toLowerCase();
    if (!['docx', 'doc', 'pdf'].includes(ext)) {
      toast.error('Format non supporté. Utilisez .docx, .doc ou .pdf');
      return;
    }
    setPendingFile(f);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (remaining === 0) return;
    const f = e.dataTransfer.files[0];
    if (f) handleFileSelect(f);
  }

  async function uploadPending() {
    if (!pendingFile) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', pendingFile);
      fd.append('type', pendingType);
      fd.append('description', pendingDesc);
      fd.append('year', pendingYear);

      const res = await fetch('/api/teacher/verification-files', {
        method: 'POST',
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Erreur');
        return;
      }
      toast.success(data.message || 'Fichier reçu !');
      // Refresh files
      await refresh();
      // Clear
      setPendingFile(null);
      setPendingDesc('');
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (e) {
      toast.error('Erreur réseau');
    } finally {
      setUploading(false);
    }
  }

  async function refresh() {
    const res = await fetch('/api/teacher/verification-files');
    const data = await res.json();
    setFiles(data.files);
    setRemaining(data.request.remaining);
  }

  async function deleteFile(id: string) {
    if (!confirm('Supprimer ce fichier ?')) return;
    try {
      const res = await fetch(`/api/teacher/verification-files?id=${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error);
        return;
      }
      toast.success('Fichier supprimé');
      setFiles(files.filter((f) => f.id !== id));
      setRemaining(data.remaining);
    } catch {
      toast.error('Erreur');
    }
  }

  return (
    <div className="space-y-6">
      {/* Header info */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-white border border-slate-200 rounded-xl p-4 text-center">
          <div className="text-3xl font-extrabold text-violet-700">{totalUploaded}/5</div>
          <div className="text-xs text-slate-500 font-semibold uppercase mt-1">Fichiers reçus</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4 text-center">
          <div className="text-3xl font-extrabold text-slate-700">{remaining}</div>
          <div className="text-xs text-slate-500 font-semibold uppercase mt-1">Restants</div>
        </div>
        <div
          className={`border rounded-xl p-4 text-center ${allUploaded ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}
        >
          <div
            className={`text-3xl font-extrabold ${allUploaded ? 'text-emerald-700' : 'text-amber-700'}`}
          >
            {allUploaded ? '✓' : '⏱️'}
          </div>
          <div
            className={`text-xs font-semibold uppercase mt-1 ${allUploaded ? 'text-emerald-600' : 'text-amber-600'}`}
          >
            {allUploaded ? 'Complet' : 'En cours'}
          </div>
        </div>
      </div>

      {/* Admin's note */}
      {note && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <div className="font-bold text-amber-900 text-sm mb-1">📝 Message de l'équipe :</div>
          <p className="text-sm text-amber-800 whitespace-pre-line">{note}</p>
        </div>
      )}

      {/* Upload zone (or completion message) */}
      {allUploaded ? (
        <div className="bg-gradient-to-br from-emerald-50 to-white border-2 border-emerald-200 rounded-2xl p-8 text-center">
          <div className="text-6xl mb-3">🎉</div>
          <h3 className="text-2xl font-extrabold text-emerald-800 mb-2">
            Tous vos fichiers ont été reçus !
          </h3>
          <p className="text-emerald-700">
            Notre équipe va examiner vos fichiers sous 48h. Vous recevrez un email dès que votre
            compte sera approuvé.
          </p>
        </div>
      ) : (
        <>
          {/* Drop zone */}
          <div
            role="region"
            aria-label="Zone de dépôt de fichier"
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`relative border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition ${
              dragOver
                ? 'border-violet-500 bg-violet-50'
                : 'border-slate-300 bg-slate-50 hover:border-violet-400 hover:bg-violet-50/30'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".docx,.doc,.pdf,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              onChange={(e) => handleFileSelect(e.target.files?.[0] || null)}
              className="hidden"
            />
            <div className="text-5xl mb-3">📁</div>
            <p className="font-bold text-slate-800 text-lg mb-1">Glissez votre fichier ici</p>
            <p className="text-sm text-slate-500">
              ou cliquez pour parcourir — .docx, .doc, .pdf (max 25 MB)
            </p>
          </div>

          {/* Pending file preview + metadata */}
          {pendingFile && (
            <div className="bg-white border-2 border-violet-300 rounded-2xl p-5">
              <div className="flex items-start gap-3 mb-4">
                <div className="w-12 h-12 rounded-xl bg-violet-100 text-violet-600 flex items-center justify-center flex-shrink-0">
                  <FileText className="w-6 h-6" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-slate-900 truncate">{pendingFile.name}</div>
                  <div className="text-xs text-slate-500">
                    {formatSize(pendingFile.size)} •{' '}
                    {pendingFile.name.split('.').pop()?.toUpperCase()}
                  </div>
                </div>
                <button
                  onClick={() => {
                    setPendingFile(null);
                    if (fileInputRef.current) fileInputRef.current.value = '';
                  }}
                  className="p-2 hover:bg-slate-100 rounded-lg"
                >
                  <X className="w-4 h-4 text-slate-400" />
                </button>
              </div>

              <div className="grid sm:grid-cols-2 gap-3 mb-4">
                <div>
                  <label htmlFor="fileType" className="block text-xs font-semibold text-slate-700 mb-1">Type *</label>
                  <select id="fileType"
                    value={pendingType}
                    onChange={(e) => setPendingType(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                  >
                    {FILE_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="fileYear" className="block text-xs font-semibold text-slate-700 mb-1">Année</label>
                  <input
                    type="text"
                    value={pendingYear}
                    onChange={(e) => setPendingYear(e.target.value)}
                    placeholder="2024"
                    maxLength={4}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                  />
                </div>
              </div>

              <div className="mb-4">
                <label htmlFor="fileDesc" className="block text-xs font-semibold text-slate-700 mb-1">
                  Description (optionnel)
                </label>
                <textarea id="fileDesc"
                  value={pendingDesc}
                  onChange={(e) => setPendingDesc(e.target.value)}
                  placeholder="Ex: Cours complet sur les intégrales pour 4ème Math"
                  rows={2}
                  maxLength={300}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm resize-none"
                />
                <div className="text-xs text-slate-400 text-right">{pendingDesc.length}/300</div>
              </div>

              <button
                onClick={uploadPending}
                disabled={uploading}
                className="w-full py-3 bg-gradient-to-r from-violet-500 to-purple-600 text-white font-bold rounded-xl hover:from-violet-600 hover:to-purple-700 transition shadow-md disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {uploading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Envoi en cours...
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4" /> Envoyer ce fichier
                  </>
                )}
              </button>
            </div>
          )}
        </>
      )}

      {/* Already uploaded files */}
      {files.length > 0 && (
        <div>
          <h3 className="font-bold text-slate-800 mb-3 flex items-center gap-2">
            <FileCheck className="w-5 h-5 text-emerald-600" />
            Vos fichiers envoyés ({files.length})
          </h3>
          <div className="space-y-2">
            {files.map((f) => {
              const typeInfo = FILE_TYPES.find((t) => t.value === f.type);
              return (
                <div
                  key={f.id}
                  className="bg-white border border-slate-200 rounded-xl p-4 flex items-start gap-3"
                >
                  <div className="w-10 h-12 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center flex-shrink-0">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="font-bold text-sm text-slate-900 truncate">{f.fileName}</div>
                      {f.reviewedByAdmin && (
                        <span className="inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 flex-shrink-0">
                          <CheckCircle className="w-3 h-3 me-0.5" /> Examiné
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-500 flex items-center gap-2 flex-wrap">
                      <span>{formatSize(f.fileSize)}</span>
                      <span>•</span>
                      <span>{typeInfo?.label || f.type}</span>
                      {f.year && (
                        <>
                          <span>•</span>
                          <span>{f.year}</span>
                        </>
                      )}
                      <span>•</span>
                      <span>Envoyé le {new Date(f.uploadedAt).toLocaleDateString('fr-FR')}</span>
                    </div>
                    {f.description && (
                      <p className="text-xs text-slate-600 mt-1 line-clamp-2">{f.description}</p>
                    )}
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    <a
                      href={f.fileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2 hover:bg-slate-100 rounded-lg text-slate-500"
                      title="Voir le fichier"
                    >
                      <Download className="w-4 h-4" />
                    </a>
                    {!f.reviewedByAdmin && (
                      <button
                        onClick={() => deleteFile(f.id)}
                        className="p-2 hover:bg-red-50 text-slate-400 hover:text-red-500 rounded-lg"
                        title="Supprimer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Deadline warning */}
      {initialRequestedAt && !allUploaded && (
        <div
          className={`rounded-xl p-4 border ${isOld ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'}`}
        >
          <div className="flex items-start gap-2">
            <AlertCircle
              className={`w-5 h-5 flex-shrink-0 mt-0.5 ${isOld ? 'text-red-600' : 'text-amber-600'}`}
            />
            <div className={`text-sm ${isOld ? 'text-red-800' : 'text-amber-800'}`}>
              <strong>Date limite : 7 jours après la demande.</strong>{' '}
              {isOld
                ? '⚠️ Vous avez dépassé le délai. Contactez-nous si vous avez besoin de plus de temps.'
                : "Merci d'envoyer vos fichiers dans les délais pour finaliser la vérification."}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
