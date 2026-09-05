'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { Lock } from 'lucide-react';

type TeacherFile = {
  id: string;
  fileName: string;
  originalFormat: string;
  fileKey: string;
  fileUrl: string;
  fileSize: number;
  pdfKey?: string | null;
  pdfUrl?: string | null;
  pdfSize?: number | null;
  conversionStatus?: string | null;
  type?: string | null;
  classId?: string | null;
  sectionId?: string | null;
  subjectId?: string | null;
  trimester?: string | null;
  year?: string | null;
  tags?: string | null;
  notes?: string | null;
  resourceId?: string | null;
  resource?: { id: string; numericId?: number | null; slug?: string; status: string; rejectionReason?: string | null; rejectionAt?: number | null } | null;
  createdAt: string;
  class?: { id: string; nameFr: string; nameAr: string } | null;
  section?: { id: string; nameFr: string; nameAr: string } | null;
  subject?: { id: string; nameFr: string; nameAr: string; color?: string | null } | null;
};

type Filter = {
  search: string;
  classId: string;
  subjectId: string;
  type: string;
  format: string;
};

const FILE_TYPES = [
  { value: 'COURSE', label: 'Cours', icon: '📖', color: 'sky' },
  { value: 'DEVOIR', label: 'Devoir', icon: '📝', color: 'amber' },
  { value: 'EXERCISE', label: 'Exercice', icon: '✏️', color: 'emerald' },
  { value: 'SERIES', label: 'Série', icon: '📋', color: 'violet' },
  { value: 'EXAM', label: 'Examen', icon: '📊', color: 'red' },
  { value: 'SUMMARY', label: 'Résumé', icon: '📄', color: 'blue' },
  { value: 'LESSON_PLAN', label: 'Fiche pédagogique', icon: '🎯', color: 'orange' },
];

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(d: string | null | undefined): string {
  if (!d) return 'Date inconnue';
  const date = new Date(d);
  if (isNaN(date.getTime()) || date.getFullYear() <= 1970) {
    return 'Date inconnue';
  }
  return date.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function getFormatBadge(format: string | null | undefined) {
  switch (format) {
    case 'pdf':
      return {
        label: 'PDF',
        className: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
      };
    case 'docx':
      return {
        label: 'DOCX',
        className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
      };
    case 'doc':
      return {
        label: 'DOC',
        className: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
      };
    case 'odt':
      return {
        label: 'ODT',
        className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
      };
    default:
      return {
        // Safety: format may be undefined/null (e.g. legacy rows without
        // originalFormat). Don't crash on format.toUpperCase() — fall back
        // to 'OTHER' label.
        label: (format || 'OTHER').toUpperCase(),
        className: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
      };
  }
}

export default function TeacherLibraryClient({
  classes,
  subjects,
  initialFiles = [],
  initialCanUpload = true,
}: {
  classes: { id: string; nameFr: string; nameAr: string; slug: string }[];
  subjects: {
    id: string;
    nameFr: string;
    nameAr: string;
    slug: string;
    color?: string | null;
    icon?: string | null;
  }[];
  initialFiles?: TeacherFile[];
  initialCanUpload?: boolean;
}) {
  // Normalize D1 files: extract originalFormat from filename if missing
  const normalizedInitial = (initialFiles || []).map((f: any) => {
    let fmt = f.originalFormat;
    if (!fmt && f.fileName) {
      const m = /\.([a-z0-9]+)$/i.exec(f.fileName);
      if (m) fmt = m[1].toLowerCase();
    }
    if (!fmt && f.mimeType) {
      const mt = String(f.mimeType).toLowerCase();
      if (mt.includes('pdf')) fmt = 'pdf';
      else if (mt.includes('word') || mt.includes('document')) fmt = 'docx';
      else if (mt.includes('opendocument')) fmt = 'odt';
    }
    return { ...f, originalFormat: fmt || 'other' };
  });
  const [files, setFiles] = useState<TeacherFile[]>(normalizedInitial);
  const [loading, setLoading] = useState(false);
  const [canUpload, setCanUpload] = useState<boolean>(initialCanUpload);
  const [filter, setFilter] = useState<Filter>({
    search: '',
    classId: '',
    subjectId: '',
    type: '',
    format: '',
  });
  const [view, setView] = useState<'grid' | 'list'>('grid');

  // Check if teacher is allowed to upload (status === ACTIVE).
  // Only run if initialCanUpload was not already provided (saves a network roundtrip
  // on every mount when SSR pre-fetch already has the answer).
  useEffect(() => {
    if (initialCanUpload) return; // SSR already has it, skip
    fetch('/api/teacher/status')
      .then((r) => r.json())
      .then((data) => {
        if (data?.canUpload !== undefined) setCanUpload(data.canUpload);
      })
      .catch(() => setCanUpload(true));
  }, [initialCanUpload]);

  // Track whether we've done the initial mount. We only want to fetch
  // when the user changes a filter, not on initial mount (the page.tsx
  // pre-fetches the same data via SSR and passes it as initialFiles).
  const initialMountRef = useRef(true);

  const loadFiles = useCallback(async () => {
    // Skip the initial mount: SSR already gave us initialFiles.
    if (initialMountRef.current) {
      initialMountRef.current = false;
      return;
    }
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filter.search) params.set('search', filter.search);
      if (filter.classId) params.set('classId', filter.classId);
      if (filter.subjectId) params.set('subjectId', filter.subjectId);
      if (filter.type) params.set('type', filter.type);
      if (filter.format) params.set('format', filter.format);

      const res = await fetch(`/api/teacher/files?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur chargement');
      setFiles(data.files || []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur chargement');
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  const handleDelete = async (id: string, fileName: string) => {
    if (!confirm(`Supprimer définitivement "${fileName}" de votre bibliothèque ?`)) return;
    try {
      const res = await fetch(`/api/teacher/files?id=${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur suppression');
      toast.success('Fichier supprimé de la bibliothèque');
      loadFiles();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur suppression');
    }
  };

  const typeInfo = (type: string | null | undefined) => {
    const found = FILE_TYPES.find((t) => t.value === type);
    if (found) return found;
    return { value: type || 'OTHER', label: type || 'Autre', icon: '📄', color: 'slate' };
  };

  // Stats
  const stats = {
    total: files.length,
    pdf: files.filter((f) => f.originalFormat === 'pdf').length,
    docx: files.filter((f) => f.originalFormat === 'docx' || f.originalFormat === 'doc').length,
    converted: files.filter((f) => f.conversionStatus === 'SUCCESS').length,
    used: files.filter((f) => f.resourceId).length,
    totalSize: files.reduce((s, f) => s + f.fileSize, 0),
  };

  return (
    <div className="space-y-6">
      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatCard icon="📚" label="Total" value={stats.total} color="sky" />
        <StatCard icon="📄" label="PDF" value={stats.pdf} color="red" />
        <StatCard icon="📝" label="Word" value={stats.docx} color="blue" />
        <StatCard icon="✅" label="Convertis" value={stats.converted} color="emerald" />
        <StatCard icon="📤" label="Publiés" value={stats.used} color="violet" />
      </div>

      {/* Filters bar */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-4 shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <div className="md:col-span-2">
            <div className="relative">
              <input
                type="text"
                placeholder="Rechercher dans mes fichiers…"
                value={filter.search}
                onChange={(e) => setFilter((f) => ({ ...f, search: e.target.value }))}
                className="w-full ps-10 pe-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-primary focus:border-transparent"
              />
              <span className="absolute start-3 top-1/2 -translate-y-1/2 text-slate-400">🔍</span>
            </div>
          </div>
          <select
            value={filter.format}
            onChange={(e) => setFilter((f) => ({ ...f, format: e.target.value }))}
            className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
          >
            <option value="">Tous les formats</option>
            <option value="pdf">PDF</option>
            <option value="docx">Word (.docx)</option>
            <option value="doc">Word 97-2003 (.doc)</option>
            <option value="odt">OpenOffice (.odt)</option>
          </select>
          <select
            value={filter.classId}
            onChange={(e) => setFilter((f) => ({ ...f, classId: e.target.value }))}
            className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
          >
            <option value="">Toutes les classes</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nameFr}
              </option>
            ))}
          </select>
          <select
            value={filter.type}
            onChange={(e) => setFilter((f) => ({ ...f, type: e.target.value }))}
            className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
          >
            <option value="">Tous les types</option>
            {FILE_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.icon} {t.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-200 dark:border-slate-700">
          <div className="text-sm text-slate-500 dark:text-slate-400">
            {files.length} fichier{files.length > 1 ? 's' : ''} • Espace utilisé :{' '}
            {formatBytes(stats.totalSize)}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setView('grid')}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition ${view === 'grid' ? 'bg-primary text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'}`}
            >
              ▦ Grille
            </button>
            <button
              onClick={() => setView('list')}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition ${view === 'list' ? 'bg-primary text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'}`}
            >
              ☰ Liste
            </button>
          </div>
        </div>
      </div>

      {/* Files */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary border-t-transparent" />
        </div>
      ) : files.length === 0 ? (
        <EmptyState canUpload={canUpload} />
      ) : view === 'grid' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {files.map((file) => (
            <FileCard
              key={file.id}
              file={file}
              typeInfo={typeInfo(file.type)}
              onDelete={handleDelete}
            />
          ))}
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
          <table className="w-full">
            <thead className="bg-slate-50 dark:bg-slate-800 text-xs uppercase text-slate-500 dark:text-slate-400">
              <tr>
                <th className="px-4 py-3 text-left">Fichier</th>
                <th className="px-4 py-3 text-left">Format</th>
                <th className="px-4 py-3 text-left">Type</th>
                <th className="px-4 py-3 text-left">Classe</th>
                <th className="px-4 py-3 text-left">Taille</th>
                <th className="px-4 py-3 text-left">Date</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
              {files.map((file) => {
                const ti = typeInfo(file.type);
                const fb = getFormatBadge(file.originalFormat);
                return (
                  <tr key={file.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">{ti.icon}</span>
                        <div className="min-w-0">
                          <div
                            className="font-medium text-slate-900 dark:text-white truncate max-w-[280px]"
                            title={file.fileName}
                          >
                            {file.fileName}
                          </div>
                          {file.conversionStatus && (
                            <div className="text-xs text-slate-500">
                              {file.conversionStatus === 'SUCCESS' && '✅ PDF généré'}
                              {file.conversionStatus === 'FAILED' && '⚠️ Échec conversion'}
                              {file.conversionStatus === 'SKIPPED' && '✓ Original PDF'}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${fb.className}`}
                      >
                        {fb.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm">{ti.label}</td>
                    <td className="px-4 py-3 text-sm">{file.class?.nameFr || '—'}</td>
                    <td className="px-4 py-3 text-sm">{formatBytes(file.fileSize)}</td>
                    <td className="px-4 py-3 text-sm">{formatDate(file.createdAt)}</td>
                    <td className="px-4 py-3 text-right">
                      <FileActions file={file} onDelete={handleDelete} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  color,
}: {
  icon: string;
  label: string;
  value: number;
  color: string;
}) {
  const colorMap: Record<string, string> = {
    sky: 'from-sky-500 to-sky-600',
    red: 'from-red-500 to-red-600',
    blue: 'from-blue-500 to-blue-600',
    emerald: 'from-emerald-500 to-emerald-600',
    violet: 'from-violet-500 to-violet-600',
  };
  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
      <div className="flex items-center gap-3">
        <div
          className={`w-10 h-10 rounded-lg bg-gradient-to-br ${colorMap[color]} flex items-center justify-center text-xl shadow-sm`}
        >
          {icon}
        </div>
        <div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white">{value}</div>
          <div className="text-xs text-slate-500 dark:text-slate-400">{label}</div>
        </div>
      </div>
    </div>
  );
}

function EmptyState({ canUpload = true }: { canUpload?: boolean }) {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-700 p-12 text-center">
      <div className="text-6xl mb-4">📚</div>
      <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">
        Votre bibliothèque est vide
      </h3>
      <p className="text-slate-600 dark:text-slate-400 mb-6 max-w-md mx-auto">
        Quand vous uploadez un fichier Word ou PDF, l'original est automatiquement sauvegardé ici.
        Vous pourrez le télécharger à tout moment et le réutiliser pour publier de nouvelles
        ressources.
      </p>
      <Link
        href={canUpload ? '/enseignant/ajouter' : '/enseignant'}
        className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-lg font-medium shadow-md hover:shadow-lg transition ${
          canUpload
            ? 'bg-gradient-to-r from-primary to-cyan-500 text-white'
            : 'bg-slate-200 text-slate-500'
        }`}
      >
        {canUpload ? <span>📤</span> : <Lock className="w-4 h-4" />}
        {canUpload ? 'Ajouter une ressource' : "Soumettre mes fichiers d'abord"}
      </Link>
    </div>
  );
}

function FileCard({
  file,
  typeInfo,
  onDelete,
}: {
  file: TeacherFile;
  typeInfo: { value: string; label: string; icon: string; color: string };
  onDelete: (id: string, name: string) => void;
}) {
  const fb = getFormatBadge(file.originalFormat);
  return (
    <div className="group bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden hover:shadow-lg hover:border-primary/40 transition-all duration-200">
      {/* Top stripe with type icon */}
      <div className="h-2 bg-gradient-to-r from-primary via-cyan-400 to-blue-500" />
      <div className="p-4">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="text-3xl">{typeInfo.icon}</div>
          <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold ${fb.className}`}>
            {fb.label}
          </span>
        </div>
        <h3
          className="font-semibold text-slate-900 dark:text-white line-clamp-2 mb-1"
          title={file.fileName}
        >
          {file.fileName}
        </h3>
        <div className="text-xs text-slate-500 dark:text-slate-400 space-y-1 mb-3">
          {file.subject && <div>📖 {file.subject.nameFr}</div>}
          {file.class && <div>🎓 {file.class.nameFr}</div>}
          <div className="flex items-center gap-2">
            <span>💾 {formatBytes(file.fileSize)}</span>
            <span>•</span>
            <span>{formatDate(file.createdAt)}</span>
          </div>
        </div>

        {/* Conversion status */}
        {file.conversionStatus === 'SUCCESS' && (
          <div className="mb-3 px-2 py-1 rounded-md bg-emerald-50 dark:bg-emerald-900/20 text-xs text-emerald-700 dark:text-emerald-300 flex items-center gap-1">
            <span>✅</span> PDF converti disponible
          </div>
        )}
        {file.conversionStatus === 'FAILED' && (
          <div className="mb-3 px-2 py-1 rounded-md bg-amber-50 dark:bg-amber-900/20 text-xs text-amber-700 dark:text-amber-300 flex items-center gap-1">
            <span>⚠️</span> Conversion échouée
          </div>
        )}
        {file.resource && file.resource.status === 'PUBLISHED' && (
          <>
            <div className="mb-3 px-2 py-1 rounded-md bg-violet-50 dark:bg-violet-900/20 text-xs text-violet-700 dark:text-violet-300 flex items-center gap-1">
              <span>📤</span> Ressource publiée
            </div>
            {file.resource.numericId && file.resource.slug && (
              <Link
                href={`/ressources/${file.resource.numericId}/${file.resource.slug}`}
                target="_blank"
                className="mb-3 w-full inline-flex items-center justify-center gap-1 px-3 py-2 bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-700 hover:to-fuchsia-700 text-white rounded-lg text-sm font-bold transition shadow-sm"
                title="Voir la ressource publiée sur Examanet"
              >
                <span>👁️</span> Voir sur Examanet
              </Link>
            )}
          </>
        )}
        {file.resource && file.resource.status === 'PENDING_APPROVAL' && (
          <div className="mb-3 px-2 py-1 rounded-md bg-amber-50 dark:bg-amber-900/20 text-xs text-amber-700 dark:text-amber-300 flex items-center gap-1">
            <span>⏳</span> En attente d'approbation
          </div>
        )}
        {file.resource && file.resource.status === 'REJECTED' && (
          <>
            <div className="mb-2 px-2 py-1 rounded-md bg-red-50 dark:bg-red-900/20 text-xs text-red-700 dark:text-red-300 flex items-center gap-1 font-semibold">
              <span>❌</span> Ressource refusée
              {file.resource.rejectionAt && (
                <span className="text-red-500/80 dark:text-red-400/70 font-normal">
                  · {new Date(file.resource.rejectionAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}
                </span>
              )}
            </div>
            {file.resource.rejectionReason && (
              <div
                className="mb-3 px-3 py-2 rounded-md bg-red-50/60 dark:bg-red-900/10 border-l-2 border-red-400 text-xs text-red-800 dark:text-red-300 italic"
                title="Motif du refus communiqué par l'administrateur"
              >
                <div className="not-italic font-semibold text-[10px] uppercase tracking-wider text-red-600 dark:text-red-400 mb-1">
                  💬 Motif de l'administrateur
                </div>
                {file.resource.rejectionReason}
              </div>
            )}
          </>
        )}
        {file.resource && file.resource.status === 'DRAFT' && (
          <div className="mb-3 px-2 py-1 rounded-md bg-slate-100 dark:bg-slate-800 text-xs text-slate-600 dark:text-slate-400 flex items-center gap-1">
            <span>📝</span> Brouillon
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-1">
          <a
            href={file.fileUrl}
            target="_blank"
            rel="noopener noreferrer"
            download={file.fileName}
            className="flex-1 inline-flex items-center justify-center gap-1 px-3 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-primary hover:text-white rounded-lg text-sm font-medium text-slate-700 dark:text-slate-200 transition"
            title="Télécharger l'original"
          >
            <span>⬇️</span> Original
          </a>
          {file.pdfUrl && file.pdfKey !== file.fileKey && (
            <a
              href={file.pdfUrl}
              target="_blank"
              rel="noopener noreferrer"
              download={`${file.fileName.replace(/\.[^.]+$/, '')}.pdf`}
              className="flex-1 inline-flex items-center justify-center gap-1 px-3 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-red-500 hover:text-white rounded-lg text-sm font-medium text-slate-700 dark:text-slate-200 transition"
              title="Télécharger le PDF"
            >
              <span>📄</span> PDF
            </a>
          )}
          <button
            onClick={() => onDelete(file.id, file.fileName)}
            className="px-2 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-red-500 hover:text-white rounded-lg text-slate-500 dark:text-slate-400 transition"
            title="Supprimer"
          >
            🗑️
          </button>
        </div>
      </div>
    </div>
  );
}

function FileActions({
  file,
  onDelete,
}: {
  file: TeacherFile;
  onDelete: (id: string, name: string) => void;
}) {
  return (
    <div className="flex items-center justify-end gap-1">
      {file.resource?.status === 'PUBLISHED' && file.resource.numericId && file.resource.slug && (
        <Link
          href={`/ressources/${file.resource.numericId}/${file.resource.slug}`}
          target="_blank"
          className="px-2 py-1 text-xs bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-700 hover:to-fuchsia-700 text-white rounded font-bold transition"
          title="Voir la ressource publiée sur Examanet"
        >
          👁️ Voir
        </Link>
      )}
      <a
        href={file.fileUrl}
        target="_blank"
        rel="noopener noreferrer"
        download={file.fileName}
        className="px-2 py-1 text-xs bg-slate-100 dark:bg-slate-800 hover:bg-primary hover:text-white rounded text-slate-700 dark:text-slate-200 transition"
        title="Télécharger l'original"
      >
        ⬇️ Original
      </a>
      {file.pdfUrl && file.pdfKey !== file.fileKey && (
        <a
          href={file.pdfUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="px-2 py-1 text-xs bg-slate-100 dark:bg-slate-800 hover:bg-red-500 hover:text-white rounded text-slate-700 dark:text-slate-200 transition"
          title="PDF"
        >
          📄 PDF
        </a>
      )}
      <button
        onClick={() => onDelete(file.id, file.fileName)}
        className="px-2 py-1 text-xs bg-slate-100 dark:bg-slate-800 hover:bg-red-500 hover:text-white rounded text-slate-500 dark:text-slate-400 transition"
        title="Supprimer"
      >
        🗑️
      </button>
    </div>
  );
}
