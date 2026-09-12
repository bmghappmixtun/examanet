'use client';

/**
 * 2026-09-11: New dedicated admin tab for teacher verification files.
 *
 * Modern grid-based UI with:
 * - Filterable teacher cards (status, search)
 * - Per-teacher file progress (X/5 reçus, Y/5 examinés)
 * - Inline file preview modal
 * - Per-file review toggle
 * - Approve/Reject teacher with confirmation
 * - Beautiful gradients, smooth transitions, mobile-responsive
 */

import { useState, useMemo, useEffect } from 'react';
import {
  Shield,
  CheckCircle2,
  Clock,
  XCircle,
  FileText,
  Download,
  Eye,
  Loader2,
  AlertCircle,
  Search,
  ChevronRight,
  Mail,
  GraduationCap,
  MapPin,
  Calendar,
} from 'lucide-react';
import toast from 'react-hot-toast';

// ---------- Types ----------

type VerificationFile = {
  id: string;
  fileName: string;
  originalFormat: string | null;
  fileUrl: string;
  mimeType: string | null;
  fileSize: number | null;
  type: string | null;
  description: string | null;
  year: string | null;
  reviewedByAdmin: boolean;
  reviewNote: string | null;
  reviewedAt: number | null;
  uploadedAt: number | null;
  createdAt: number | null;
};

type Teacher = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  schoolName: string | null;
  governorate: string | null;
  diploma: string | null;
  status: string;
  isVerifiedTeacher: boolean;
  verifiedAt: number | null;
  verificationFilesRequestedAt: number | null;
  verificationFilesReceivedAt: number | null;
  verificationFilesNote: string | null;
  files: VerificationFile[];
  reviewedCount: number;
};

type Props = {
  initialTeachers: Teacher[];
};

// ---------- Constants ----------

const STATUS_TABS = [
  { key: 'all', label: 'Tous', color: 'slate' },
  { key: 'PENDING_REVIEW', label: 'En attente examen', color: 'amber' },
  { key: 'PENDING_FILE_VERIFICATION', label: 'En attente fichiers', color: 'orange' },
  { key: 'ACTIVE', label: 'Approuvés', color: 'emerald' },
] as const;

const FILE_TYPES: Record<string, string> = {
  COURSE: '📚 Cours',
  DEVOIR: '📝 Devoir',
  EXERCISE: '✏️ Série',
  REVISION: '🔄 Révision',
  EXAM: '📋 Examen',
  BAC_SUBJECT: '🎓 Sujet Bac',
  CORRECTION: '✅ Corrigé',
  OTHER: '📁 Autre',
};

// ---------- Helpers ----------

function formatSize(bytes: number | null | undefined): string {
  const n = bytes || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function formatDate(ts: number | null): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function formatRelative(ts: number | null, now: number | null): string {
  if (!ts) return '—';
  if (now == null) return formatDate(ts); // SSR-safe: use absolute date until client hydrates
  const diff = now - ts;
  const min = 60 * 1000;
  const hr = 60 * min;
  const day = 24 * hr;
  if (diff < min) return "à l'instant";
  if (diff < hr) return `il y a ${Math.floor(diff / min)} min`;
  if (diff < day) return `il y a ${Math.floor(diff / hr)} h`;
  if (diff < 7 * day) return `il y a ${Math.floor(diff / day)} j`;
  return formatDate(ts);
}

// ---------- Component ----------

export default function VerificationsClient({ initialTeachers }: Props) {
  const [teachers, setTeachers] = useState<Teacher[]>(initialTeachers);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | string>('all');
  const [openTeacherId, setOpenTeacherId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDismissLoading, setBulkDismissLoading] = useState(false);
  const [acting, setActing] = useState<Record<string, boolean>>({});
  const [previewFile, setPreviewFile] = useState<VerificationFile | null>(null);
  // 2026-09-12: Avoid hydration mismatch by setting 'now' only on client mount.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  // Stats
  const stats = useMemo(() => {
    const pendingReview = teachers.filter((t) => t.status === 'PENDING_REVIEW').length;
    const pendingFiles = teachers.filter((t) => t.status === 'PENDING_FILE_VERIFICATION').length;
    const approved = teachers.filter((t) => t.status === 'ACTIVE' && t.isVerifiedTeacher).length;
    const totalReviewed = teachers.reduce((acc, t) => acc + t.reviewedCount, 0);
    const totalFiles = teachers.reduce((acc, t) => acc + t.files.length, 0);
    return { pendingReview, pendingFiles, approved, totalReviewed, totalFiles };
  }, [teachers]);

  // Filtered teachers
  const filtered = useMemo(() => {
    let list = teachers;
    if (statusFilter !== 'all') {
      list = list.filter((t) => t.status === statusFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (t) =>
          t.email.toLowerCase().includes(q) ||
          (t.firstName || '').toLowerCase().includes(q) ||
          (t.lastName || '').toLowerCase().includes(q) ||
          (t.schoolName || '').toLowerCase().includes(q),
      );
    }
    return list;
  }, [teachers, statusFilter, searchQuery]);

  // ---------- File review ----------

  async function toggleFileReviewed(teacherId: string, fileId: string, currentValue: boolean) {
    const key = `${teacherId}:${fileId}`;
    setActing((a) => ({ ...a, [key]: true }));
    try {
      const res = await fetch(`/api/admin/teacher/${teacherId}/verification-files`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileId, reviewed: !currentValue }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Erreur');
        return;
      }
      // Update local state
      setTeachers((prev) =>
        prev.map((t) => {
          if (t.id !== teacherId) return t;
          const newFiles = t.files.map((f) =>
            f.id === fileId
              ? {
                  ...f,
                  reviewedByAdmin: !currentValue,
                  reviewedAt: !currentValue ? Date.now() : null,
                }
              : f,
          );
          return {
            ...t,
            files: newFiles,
            reviewedCount: newFiles.filter((f) => f.reviewedByAdmin).length,
          };
        }),
      );
      toast.success(!currentValue ? '✅ Fichier marqué examiné' : 'Fichier démarqué');
    } catch {
      toast.error('Erreur réseau');
    } finally {
      setActing((a) => {
        const { [key]: _, ...rest } = a;
        return rest;
      });
    }
  }

  // ---------- Approve/Reject teacher ----------

  async function approveOrReject(teacher: Teacher, action: 'approve' | 'reject') {
    if (action === 'approve') {
      const reviewed = teacher.files.filter((f) => f.reviewedByAdmin).length;
      if (reviewed < teacher.files.length) {
        toast.error(`Vous devez examiner tous les fichiers (${reviewed}/${teacher.files.length})`);
        return;
      }
      if (
        !confirm(
          `✅ Approuver ${teacher.firstName} ${teacher.lastName} comme Enseignant Vérifié ?\n\nUn email de félicitations sera envoyé.`,
        )
      ) {
        return;
      }
    } else {
      const reason = prompt('Motif de rejet (optionnel) :');
      if (reason === null) return;
      await sendDecision(teacher, 'reject', reason);
      return;
    }
    await sendDecision(teacher, 'approve');
  }

  async function sendDecision(teacher: Teacher, action: 'approve' | 'reject', reason?: string) {
    const key = `${teacher.id}:decision`;
    setActing((a) => ({ ...a, [key]: true }));
    try {
      const res = await fetch(`/api/admin/teacher/${teacher.id}/approve-verification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, reason }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Erreur');
        return;
      }
      if (action === 'approve') {
        toast.success(
          data.emailSent
            ? '🎉 Enseignant vérifié ! Email envoyé.'
            : '🎉 Enseignant vérifié (email non envoyé).',
        );
        // Update local state
        setTeachers((prev) =>
          prev.map((t) =>
            t.id === teacher.id
              ? { ...t, status: 'ACTIVE', isVerifiedTeacher: true, verifiedAt: Date.now() }
              : t,
          ),
        );
      } else {
        toast.success('Fichiers rejetés. Prof peut renvoyer.');
        setTeachers((prev) =>
          prev.map((t) =>
            t.id === teacher.id
              ? {
                  ...t,
                  status: 'PENDING_FILE_VERIFICATION',
                  files: [],
                  reviewedCount: 0,
                  verificationFilesReceivedAt: null,
                }
              : t,
          ),
        );
      }
      setOpenTeacherId(null);
    } catch {
      toast.error('Erreur réseau');
    } finally {
      setActing((a) => {
        const { [key]: _, ...rest } = a;
        return rest;
      });
    }
  }

  // ---------- Bulk dismiss ----------
  async function bulkDismiss() {
    if (selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    if (!confirm(`Vider ${ids.length} enseignant(s) de la page ?

⚠️ Les comptes restent en base — ils ne seront plus visibles dans cette page.`)) return;

    setBulkDismissLoading(true);
    try {
      const res = await fetch('/api/admin/teachers/bulk-dismiss', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        toast.error(data.error || 'Erreur lors du dismiss');
        return;
      }
      // Remove dismissed teachers from local state
      setTeachers((prev) => prev.filter((t) => !selectedIds.has(t.id)));
      setSelectedIds(new Set());
      toast.success(`${data.dismissed} enseignant(s) masqué(s) de la page`);
    } catch (e) {
      console.error(e);
      toast.error('Erreur réseau');
    } finally {
      setBulkDismissLoading(false);
    }
  }

  function toggleSelectAll() {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((t) => t.id)));
    }
  }

  // ---------- Render ----------

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-violet-50 p-4 lg:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 text-white flex items-center justify-center shadow-lg">
                <Shield className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-3xl font-extrabold text-slate-900">Vérifications enseignants</h1>
                <p className="text-sm text-slate-500 mt-0.5">
                  Examinez les fichiers et approuvez les enseignants
                </p>
              </div>
            </div>
          </div>

          {/* Bulk actions */}
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-2 bg-violet-50 border border-violet-200 rounded-xl px-3 py-2">
              <span className="text-sm font-semibold text-violet-700">
                {selectedIds.size} sélectionné{selectedIds.size > 1 ? 's' : ''}
              </span>
              <button
                onClick={toggleSelectAll}
                className="text-xs font-semibold text-violet-700 hover:text-violet-900 underline"
              >
                {selectedIds.size === filtered.length ? 'Tout désélectionner' : 'Tout sélectionner'}
              </button>
              <button
                onClick={bulkDismiss}
                disabled={bulkDismissLoading}
                className="ml-2 px-3 py-1.5 bg-violet-600 hover:bg-violet-700 disabled:bg-violet-400 text-white text-xs font-bold rounded-lg transition flex items-center gap-1.5"
              >
                {bulkDismissLoading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Trash2 className="w-3.5 h-3.5" />
                )}
                Vider la page
              </button>
              <button
                onClick={() => setSelectedIds(new Set())}
                className="text-xs font-semibold text-slate-500 hover:text-slate-700 ml-1"
              >
                Annuler
              </button>
            </div>
          )}

          {/* Stats */}
          <div className="flex gap-2 flex-wrap">
            <StatPill color="amber" icon={Clock} value={stats.pendingReview} label="En attente" />
            <StatPill color="orange" icon={FileText} value={stats.pendingFiles} label="Sans fichiers" />
            <StatPill color="emerald" icon={CheckCircle2} value={stats.approved} label="Approuvés" />
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
          <div className="flex flex-col lg:flex-row gap-3">
            {/* Search */}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Rechercher par nom, email, école..."
                className="w-full pl-10 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
              />
            </div>

            {/* Status filter tabs */}
            <div className="flex gap-1 bg-slate-100 rounded-lg p-1 overflow-x-auto">
              {STATUS_TABS.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setStatusFilter(tab.key)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md transition whitespace-nowrap ${
                    statusFilter === tab.key
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Teachers grid */}
        {filtered.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
            <Shield className="w-16 h-16 mx-auto text-slate-300 mb-3" />
            <p className="text-slate-500">Aucun enseignant correspondant.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Select all bar */}
            {filtered.length > 0 && (
              <div className="col-span-full flex items-center justify-between bg-white rounded-xl border border-slate-200 px-4 py-2.5 shadow-sm">
                <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedIds.size === filtered.length && filtered.length > 0}
                    onChange={toggleSelectAll}
                    className="w-4 h-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500"
                  />
                  Tout sélectionner ({filtered.length})
                </label>
                {selectedIds.size > 0 && (
                  <span className="text-xs text-violet-700 font-semibold">
                    {selectedIds.size} sélectionné{selectedIds.size > 1 ? 's' : ''}
                  </span>
                )}
              </div>
            )}

            {filtered.map((teacher) => (
              <div key={teacher.id} className="relative">
                <input
                  type="checkbox"
                  checked={selectedIds.has(teacher.id)}
                  onChange={(e) => {
                    e.stopPropagation();
                    setSelectedIds((prev) => {
                      const next = new Set(prev);
                      if (e.target.checked) next.add(teacher.id);
                      else next.delete(teacher.id);
                      return next;
                    });
                  }}
                  className="absolute top-3 right-3 z-10 w-5 h-5 rounded border-slate-300 text-violet-600 focus:ring-violet-500 cursor-pointer"
                />
                <TeacherCard
                  teacher={teacher}
                  isOpen={openTeacherId === teacher.id}
                  now={now}
                  onToggle={() =>
                    setOpenTeacherId((id) => (id === teacher.id ? null : teacher.id))
                  }
                onToggleFileReviewed={(fileId, current) =>
                  toggleFileReviewed(teacher.id, fileId, current)
                }
                onApproveReject={(action) => approveOrReject(teacher, action)}
                acting={acting}
                onPreview={(file) => setPreviewFile(file)}
              />
              </div>
            ))}
          </div>
        )}

        {/* Preview modal */}
        {previewFile && (
          <PreviewModal
            file={previewFile}
            onClose={() => setPreviewFile(null)}
          />
        )}
      </div>
    </div>
  );
}

// ---------- Subcomponents ----------

function StatPill({
  color,
  icon: Icon,
  value,
  label,
}: {
  color: string;
  icon: any;
  value: number;
  label: string;
}) {
  const colorMap: Record<string, string> = {
    amber: 'bg-amber-50 text-amber-700 border-amber-200',
    orange: 'bg-orange-50 text-orange-700 border-orange-200',
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  };
  return (
    <div
      className={`px-4 py-2 rounded-xl border ${colorMap[color]} flex items-center gap-2`}
    >
      <Icon className="w-4 h-4" />
      <div>
        <div className="text-lg font-extrabold leading-none">{value}</div>
        <div className="text-[10px] font-semibold uppercase mt-0.5">{label}</div>
      </div>
    </div>
  );
}

function TeacherCard({
  teacher,
  isOpen,
  now,
  onToggle,
  onToggleFileReviewed,
  onApproveReject,
  acting,
  onPreview,
}: {
  teacher: Teacher;
  isOpen: boolean;
  now: number | null;
  onToggle: () => void;
  onToggleFileReviewed: (fileId: string, current: boolean) => void;
  onApproveReject: (action: 'approve' | 'reject') => void;
  acting: Record<string, boolean>;
  onPreview: (file: VerificationFile) => void;
}) {
  const t = teacher;
  const isPendingReview = t.status === 'PENDING_REVIEW';
  const isPendingFiles = t.status === 'PENDING_FILE_VERIFICATION';
  const isApproved = t.status === 'ACTIVE' && t.isVerifiedTeacher;
  const allReviewed = t.files.length > 0 && t.reviewedCount === t.files.length;
  const decisionKey = `${t.id}:decision`;
  const isActing = acting[decisionKey];

  return (
    <div
      className={`bg-white rounded-2xl border-2 transition-all overflow-hidden ${
        isOpen ? 'border-violet-300 shadow-xl' : 'border-slate-200 hover:border-slate-300 shadow-sm'
      }`}
    >
      {/* Header */}
      <button
        onClick={onToggle}
        className="w-full text-left p-4 hover:bg-slate-50 transition"
      >
        <div className="flex items-start gap-3">
          {/* Avatar */}
          <div
            className={`w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold flex-shrink-0 ${
              isApproved
                ? 'bg-gradient-to-br from-emerald-500 to-teal-600'
                : isPendingReview
                  ? 'bg-gradient-to-br from-amber-500 to-orange-600'
                  : isPendingFiles
                    ? 'bg-gradient-to-br from-orange-500 to-red-600'
                    : 'bg-gradient-to-br from-slate-400 to-slate-600'
            }`}
          >
            {((t.firstName?.[0] || '') + (t.lastName?.[0] || '')).toUpperCase() || '?'}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="font-bold text-slate-900 truncate">
                  {t.firstName} {t.lastName}
                </div>
                <div className="text-xs text-slate-500 truncate">{t.email}</div>
              </div>
              <ChevronRight
                className={`w-5 h-5 text-slate-400 flex-shrink-0 transition-transform ${
                  isOpen ? 'rotate-90' : ''
                }`}
              />
            </div>

            {/* Status pill */}
            <div className="mt-2">
              <StatusPill teacher={t} />
            </div>

            {/* Progress bar */}
            {t.files.length > 0 && (
              <div className="mt-2">
                <div className="flex justify-between items-center text-[10px] font-bold uppercase mb-1">
                  <span className="text-slate-500">Fichiers reçus</span>
                  <span className="text-slate-700">
                    {t.files.length}/5 · {t.reviewedCount} examiné{t.reviewedCount > 1 ? 's' : ''}
                  </span>
                </div>
                <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all ${
                      allReviewed
                        ? 'bg-gradient-to-r from-emerald-400 to-teal-500'
                        : 'bg-gradient-to-r from-violet-400 to-purple-500'
                    }`}
                    style={{ width: `${(t.files.length / 5) * 100}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </button>

      {/* Expanded content */}
      {isOpen && (
        <div className="border-t border-slate-200 bg-slate-50/50">
          {/* Teacher details */}
          <div className="p-4 space-y-1.5 text-xs">
            {t.schoolName && (
              <div className="flex items-center gap-2 text-slate-600">
                <GraduationCap className="w-3.5 h-3.5 text-slate-400" />
                {t.schoolName}
                {t.governorate && (
                  <span className="flex items-center gap-1 text-slate-500">
                    <MapPin className="w-3 h-3" />
                    {t.governorate}
                  </span>
                )}
              </div>
            )}
            {t.verificationFilesRequestedAt && (
              <div className="flex items-center gap-2 text-slate-500">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                Demande envoyée {formatRelative(t.verificationFilesRequestedAt, now)}
              </div>
            )}
            {t.verificationFilesReceivedAt && (
              <div className="flex items-center gap-2 text-slate-500">
                <Mail className="w-3.5 h-3.5 text-slate-400" />
                Premier fichier reçu {formatRelative(t.verificationFilesReceivedAt, now)}
              </div>
            )}
            {t.verificationFilesNote && (
              <div className="mt-2 p-2 bg-amber-50 border border-amber-200 rounded text-amber-900">
                📝 {t.verificationFilesNote}
              </div>
            )}
          </div>

          {/* Files list */}
          {t.files.length > 0 ? (
            <div className="px-4 pb-2 space-y-2">
              <div className="text-[10px] font-bold uppercase text-slate-500 mt-2 mb-1">
                Fichiers ({t.files.length})
              </div>
              {t.files.map((f) => (
                <FileRow
                  key={f.id}
                  file={f}
                  onPreview={() => onPreview(f)}
                  onToggleReviewed={(current) => onToggleFileReviewed(f.id, current)}
                  isActing={!!acting[`${t.id}:${f.id}`]}
                />
              ))}
            </div>
          ) : (
            <div className="px-4 pb-4 text-center text-sm text-slate-500 py-6">
              <FileText className="w-10 h-10 mx-auto text-slate-300 mb-2" />
              Aucun fichier reçu pour l'instant.
            </div>
          )}

          {/* Action buttons */}
          {t.files.length > 0 && (
            <div className="p-4 border-t border-slate-200 bg-white flex gap-2">
              <button
                onClick={() => onApproveReject('reject')}
                disabled={isActing}
                title="Rejeter les fichiers et demander un renvoi"
                className="flex-1 px-3 py-2 text-xs font-bold text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg transition disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                {isActing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />}
                Rejeter
              </button>
              <button
                onClick={() => onApproveReject('approve')}
                disabled={isActing || !allReviewed}
                title={allReviewed ? 'Approuver et envoyer l\'email de félicitations' : 'Examiner tous les fichiers d\'abord'}
                className="flex-1 px-3 py-2 text-xs font-bold text-white bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 disabled:from-slate-300 disabled:to-slate-400 rounded-lg transition disabled:cursor-not-allowed flex items-center justify-center gap-1.5 shadow-sm"
              >
                {isActing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                Approuver
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StatusPill({ teacher }: { teacher: Teacher }) {
  const t = teacher;
  if (t.status === 'ACTIVE' && t.isVerifiedTeacher) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700 border border-emerald-200">
        <CheckCircle2 className="w-3 h-3" />
        Vérifié
      </span>
    );
  }
  if (t.status === 'PENDING_REVIEW') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700 border border-amber-200">
        <Clock className="w-3 h-3" />
        {t.files.length} fichier(s) à examiner
      </span>
    );
  }
  if (t.status === 'PENDING_FILE_VERIFICATION') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-orange-100 text-orange-700 border border-orange-200">
        <AlertCircle className="w-3 h-3" />
        En attente de fichiers
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
      {t.status}
    </span>
  );
}

function FileRow({
  file,
  onPreview,
  onToggleReviewed,
  isActing,
}: {
  file: VerificationFile;
  onPreview: () => void;
  onToggleReviewed: (current: boolean) => void;
  isActing: boolean;
}) {
  const isPdf = (file.originalFormat || '').toLowerCase() === 'pdf' || file.mimeType === 'application/pdf';
  return (
    <div
      className={`bg-white rounded-lg border p-2.5 transition ${
        file.reviewedByAdmin
          ? 'border-emerald-200 bg-emerald-50/40'
          : 'border-slate-200 hover:border-violet-300'
      }`}
    >
      <div className="flex items-start gap-2.5">
        <div
          className={`w-9 h-11 rounded flex items-center justify-center flex-shrink-0 text-[10px] font-bold ${
            isPdf ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600'
          }`}
        >
          {isPdf ? 'PDF' : 'DOC'}
        </div>

        <div className="flex-1 min-w-0">
          <div className="font-semibold text-xs text-slate-900 truncate" title={file.fileName || ''}>
            {file.fileName}
          </div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5 text-[10px] text-slate-500">
            <span>{formatSize(file.fileSize)}</span>
            <span>·</span>
            <span>{FILE_TYPES[file.type || 'OTHER'] || file.type}</span>
            {file.year && (
              <>
                <span>·</span>
                <span>📅 {file.year}</span>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={onPreview}
            className="p-1.5 text-slate-500 hover:text-violet-600 hover:bg-violet-50 rounded transition"
            title="Aperçu"
          >
            <Eye className="w-3.5 h-3.5" />
          </button>
          <a
            href={file.fileUrl}
            target="_blank"
            rel="noreferrer"
            className="p-1.5 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded transition"
            title="Télécharger"
          >
            <Download className="w-3.5 h-3.5" />
          </a>
          <button
            onClick={() => onToggleReviewed(file.reviewedByAdmin)}
            disabled={isActing}
            className={`px-2 py-1 text-[10px] font-bold rounded transition disabled:opacity-50 ${
              file.reviewedByAdmin
                ? 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
            }`}
          >
            {isActing ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : file.reviewedByAdmin ? (
              'Décocher'
            ) : (
              'Marquer examiné'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function PreviewModal({
  file,
  onClose,
}: {
  file: VerificationFile;
  onClose: () => void;
}) {
  const isPdf =
    (file.originalFormat || '').toLowerCase() === 'pdf' || file.mimeType === 'application/pdf';
  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b border-slate-200 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div
              className={`w-10 h-12 rounded-lg flex items-center justify-center flex-shrink-0 text-xs font-bold ${
                isPdf ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600'
              }`}
            >
              {isPdf ? 'PDF' : 'DOC'}
            </div>
            <div className="min-w-0">
              <div className="font-bold text-sm text-slate-900 truncate">{file.fileName}</div>
              <div className="text-xs text-slate-500">
                {formatSize(file.fileSize)} · {FILE_TYPES[file.type || 'OTHER'] || file.type}
                {file.year && ` · ${file.year}`}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition"
          >
            <XCircle className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-auto bg-slate-100 p-4 flex items-center justify-center">
          {isPdf ? (
            <iframe
              src={file.fileUrl}
              className="w-full h-full bg-white rounded-lg shadow"
              title={file.fileName}
            />
          ) : (
            <div className="bg-white rounded-lg shadow p-8 max-w-md text-center">
              <FileText className="w-16 h-16 mx-auto text-blue-500 mb-3" />
              <div className="font-bold text-slate-900 mb-1">{file.fileName}</div>
              <div className="text-sm text-slate-600 mb-4">
                Aperçu non disponible pour les fichiers Word. Téléchargez pour visualiser.
              </div>
              <a
                href={file.fileUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white text-sm font-bold rounded-lg transition"
              >
                <Download className="w-4 h-4" />
                Télécharger
              </a>
            </div>
          )}
        </div>
        {file.description && (
          <div className="p-3 border-t border-slate-200 bg-slate-50 text-xs text-slate-600">
            <strong className="text-slate-700">Description:</strong> {file.description}
          </div>
        )}
      </div>
    </div>
  );
}
