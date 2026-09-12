'use client';
import { useState, useMemo } from 'react';
import {
  CheckCircle,
  XCircle,
  Loader2,
  CheckSquare,
  Square,
  Users,
  FileText,
  Filter,
  FolderOpen,
  Mail,
  Shield,
  EyeOff,
  Eye,
  Trash2,
} from 'lucide-react';
import TeacherVerificationFilesViewer from '@/components/admin/TeacherVerificationFilesViewer';
import toast from 'react-hot-toast';

type Teacher = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  schoolName: string | null;
  governorate: string | null;
  diploma: string | null;
  teachingSubjects: string | null;
  teachingLevels: string | null;
  createdAt: string;
  /** Pre-formatted relative/absolute date label (server-rendered to avoid
   *  React #419 hydration mismatch — the server and the client would
   *  otherwise compute different "now" values for the diff calculation). */
  createdAtLabel: string;
  status: string;
  emailVerifiedAt?: string | null;
  invitationStatus?: string | null;
  lastInvitationId?: string | null;
  verificationFilesRequestedAt?: string | null;
  /** Same as createdAtLabel: pre-formatted on the server. */
  verificationFilesRequestedAtLabel?: string | null;
  verificationFilesCount?: number;
  verificationFilesReceivedAt?: string | null;
  _count?: {
    uploadedFiles?: number;
    library?: number;
    verificationFiles?: number;
  };
};

type Resource = {
  id: string;
  title: string;
  description: string | null;
  type: string;
  fileKey: string;
  fileUrl: string;
  subject: { nameFr: string };
  class: { nameFr: string } | null;
  teacher: {
    firstName: string | null;
    lastName: string | null;
    email: string;
    schoolName: string | null;
  } | null;
  createdAt: string;
  /** Pre-formatted relative/absolute date label (server-rendered). */
  createdAtLabel: string;
};

export default function ApprobationsClient({
  initialTeachers,
  initialResources,
}: {
  initialTeachers: Teacher[];
  initialResources: Resource[];
}) {
  const [tab, setTab] = useState<'teachers' | 'resources'>('resources'); // Default to resources since user wants files
  const [teachers, setTeachers] = useState(initialTeachers);
  const [resources, setResources] = useState(initialResources);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState<string | null>(null);
  const [bulkLoading, setBulkLoading] = useState<'approve' | 'reject' | null>(null);
  const [rejectModal, setRejectModal] = useState<{
    ids: string[];
    isBulk: boolean;
    itemTitle?: string;
  } | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [search, setSearch] = useState('');
  const [fileRequestModal, setFileRequestModal] = useState<{ teacher: Teacher } | null>(null);
  const [fileRequestNote, setFileRequestNote] = useState('');

  // Status filters — which categories of pending profs to show
  // Default: all checked (all shown). Untick to hide.
  const [statusFilters, setStatusFilters] = useState({
    pendingOtp: true,        // Email non vérifié
    pendingApproval: true,   // Non validé
    pendingFiles: true,      // Fichiers demandés
  });

  // Track which profs the admin has dismissed (hidden from approbations) — UI-only state
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [showDismissed, setShowDismissed] = useState(false);

  const currentList = tab === 'teachers' ? teachers : resources;
  const filteredList = useMemo((): (Teacher | Resource)[] => {
    // For teachers: apply status filters + dismissed hiding
    // For resources: just the search filter (existing behavior)
    let list: (Teacher | Resource)[] = currentList;
    if (tab === 'teachers') {
      // Hide dismissed by default (unless showDismissed is on)
      if (!showDismissed) {
        list = list.filter((t: any) => !dismissedIds.has(t.id));
      }
      // Apply status filters
      list = list.filter((t: any) => {
        if (t.status === 'PENDING_OTP' && !t.emailVerifiedAt) {
          return statusFilters.pendingOtp;
        }
        if (t.status === 'PENDING_APPROVAL') {
          return statusFilters.pendingApproval;
        }
        if (t.status === 'PENDING_FILE_VERIFICATION') {
          return statusFilters.pendingFiles;
        }
        // Other statuses (e.g., fallback) — always show
        return true;
      });
    }
    // Apply search
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((item) => {
        const str = JSON.stringify(item).toLowerCase();
        return str.includes(q);
      });
    }
    return list;
  }, [currentList, search, tab, statusFilters, dismissedIds, showDismissed]);

  // Count of profs in each status (for the filter UI)
  const statusCounts = useMemo(() => {
    if (tab !== 'teachers') return null;
    const counts = { pendingOtp: 0, pendingApproval: 0, pendingFiles: 0, dismissed: 0 };
    for (const t of teachers as any[]) {
      if (dismissedIds.has(t.id)) counts.dismissed++;
      else if (t.status === 'PENDING_OTP' && !t.emailVerifiedAt) counts.pendingOtp++;
      else if (t.status === 'PENDING_APPROVAL') counts.pendingApproval++;
      else if (t.status === 'PENDING_FILE_VERIFICATION') counts.pendingFiles++;
    }
    return counts;
  }, [teachers, dismissedIds, tab]);

  function toggleSelect(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  function toggleSelectAll() {
    if (selected.size === filteredList.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filteredList.map((i) => i.id)));
    }
  }

  async function handleSingle(id: string, action: 'approve' | 'reject') {
    if (action === 'reject' && tab === 'resources') {
      const item = resources.find((r) => r.id === id);
      setRejectModal({ ids: [id], isBulk: false, itemTitle: item?.title });
      setRejectReason('');
      return;
    }
    setLoading(`${id}-${action}`);
    try {
      const type = tab === 'teachers' ? 'teacher' : 'resource';
      const res = await fetch(`/api/admin/${type}/${id}/${action}`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Erreur');
        return;
      }
      toast.success(action === 'approve' ? '✅ Approuvé' : '❌ Rejeté');
      // Remove from list
      if (tab === 'teachers') {
        setTeachers((ts) => ts.filter((t) => t.id !== id));
      } else {
        setResources((rs) => rs.filter((r) => r.id !== id));
      }
      setSelected((s) => {
        const n = new Set(s);
        n.delete(id);
        return n;
      });
    } catch (e) {
      toast.error('Erreur réseau');
    } finally {
      setLoading(null);
    }
  }

  async function confirmReject() {
    if (!rejectModal) return;
    if (!rejectReason.trim()) {
      toast.error('Le motif est obligatoire');
      return;
    }
    setBulkLoading('reject');
    try {
      const promises = rejectModal.ids.map((id) =>
        fetch(`/api/admin/resource/${id}/reject`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason: rejectReason.trim() }),
        })
          .then((r) => r.json())
          .then((d) => ({ id, ok: d.success === true }))
          .catch(() => ({ id, ok: false })),
      );
      const results = await Promise.all(promises);
      const success = results.filter((r) => r.ok).length;
      const failed = results.length - success;
      if (success > 0)
        toast.success(`❌ ${success} rejeté(s)${failed > 0 ? `, ${failed} échec(s)` : ''}`);
      if (failed > 0) toast.error(`${failed} échec(s)`);
      // Remove rejected items from list
      setResources((rs) => rs.filter((r) => !results.find((x) => x.id === r.id && x.ok)));
      setSelected((s) => {
        const n = new Set(s);
        results.filter((x) => x.ok).forEach((x) => n.delete(x.id));
        return n;
      });
      setRejectModal(null);
      setRejectReason('');
    } catch (e) {
      toast.error('Erreur réseau');
    } finally {
      setBulkLoading(null);
    }
  }

  async function handleBulk(action: 'approve' | 'reject') {
    if (selected.size === 0) return;
    if (!confirm(`${action === 'approve' ? 'Approuver' : 'Rejeter'} ${selected.size} élément(s) ?`))
      return;

    setBulkLoading(action);
    const type = tab === 'teachers' ? 'teacher' : 'resource';
    const promises = Array.from(selected).map((id) =>
      fetch(`/api/admin/${type}/${id}/${action}`, { method: 'POST' })
        .then((r) => r.json())
        .then((d) => ({ id, ok: d.success === true }))
        .catch(() => ({ id, ok: false })),
    );

    const results = await Promise.all(promises);
    const successIds = results.filter((r) => r.ok).map((r) => r.id);
    const failCount = results.length - successIds.length;

    // Remove successful from list
    if (tab === 'teachers') {
      setTeachers((ts) => ts.filter((t) => !successIds.includes(t.id)));
    } else {
      setResources((rs) => rs.filter((r) => !successIds.includes(r.id)));
    }
    setSelected(new Set());
    setBulkLoading(null);

    if (failCount === 0) {
      toast.success(
        `✅ ${successIds.length} élément(s) ${action === 'approve' ? 'approuvé(s)' : 'rejeté(s)'} !`,
      );
    } else {
      toast.error(`${successIds.length} réussi, ${failCount} échoué(s)`);
    }
  }

  async function handleRequestFiles(teacher: Teacher, note: string | null) {
    setLoading(`${teacher.id}-request-files`);
    try {
      const res = await fetch(`/api/admin/teacher/${teacher.id}/request-files`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Erreur');
        return;
      }
      toast.success(`📁 Demande envoyée à ${teacher.firstName} ${teacher.lastName}`);
      // Update teacher in list (also stamp the freshly-computed label so the
      // "Demande envoyée …" line updates immediately without re-running the
      // server-side formatter on the client).
      const requestedAt = new Date().toISOString();
      setTeachers((ts) =>
        ts.map((t) =>
          t.id === teacher.id
            ? {
                ...t,
                status: 'PENDING_FILE_VERIFICATION',
                verificationFilesRequestedAt: requestedAt,
                verificationFilesRequestedAtLabel: 'à l\u2019instant',
              }
            : t,
        ),
      );
      setFileRequestModal(null);
      setFileRequestNote('');
    } catch (e) {
      toast.error('Erreur réseau');
    } finally {
      setLoading(null);
    }
  }

  // Date labels are pre-formatted on the server (see page.tsx formatDateLabel)
  // to keep the SSR-rendered text and the client-hydrated text identical.
  // The diff calculation uses `new Date()` for the "now" reference, which
  // differs by a few seconds between the server (request time) and the
  // client (hydration time), causing React #419 hydration mismatches when
  // the diff lands on a different branch (e.g. "30s" vs "1min").
  // See ERR-M3YA2R 2× React #419 on /admin/approbations (2026-08-07 nightly
  // digest, Googlebot IP 74.125.19.40).

  return (
    <div>
      {/* Tabs */}
      <div className="flex gap-2 mb-6 border-b border-slate-200">
        <button
          onClick={() => {
            setTab('resources');
            setSelected(new Set());
          }}
          className={`flex items-center gap-2 px-4 py-3 font-semibold border-b-2 transition ${
            tab === 'resources'
              ? 'border-orange-500 text-orange-600'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <FileText className="w-4 h-4" />
          Ressources ({resources.length})
        </button>
        <button
          onClick={() => {
            setTab('teachers');
            setSelected(new Set());
          }}
          className={`flex items-center gap-2 px-4 py-3 font-semibold border-b-2 transition ${
            tab === 'teachers'
              ? 'border-amber-500 text-amber-600'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <Users className="w-4 h-4" />
          Enseignants ({teachers.length})
        </button>
      </div>

      {/* Search + Bulk actions */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4 sticky top-16 bg-slate-50/95 backdrop-blur z-10 py-3 -mx-4 px-4 border-b border-slate-200">
        <div className="flex-1 relative">
          <Filter className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Filtrer ${tab === 'teachers' ? 'les enseignants' : 'les ressources'}...`}
            className="w-full ps-10 pe-4 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          />
        </div>

        {/* Status filters (only for teachers tab) */}
        {tab === 'teachers' && statusCounts && (
          <div className="flex flex-wrap items-center gap-2 px-2">
            <span className="text-xs font-semibold text-slate-500">Filtrer :</span>
            <label
              className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-lg cursor-pointer transition ${
                statusFilters.pendingOtp
                  ? 'bg-orange-100 text-orange-700 border border-orange-200'
                  : 'bg-slate-100 text-slate-400 border border-slate-200'
              }`}
            >
              <input
                type="checkbox"
                checked={statusFilters.pendingOtp}
                onChange={(e) => setStatusFilters((f) => ({ ...f, pendingOtp: e.target.checked }))}
                className="w-3 h-3"
              />
              ✉️ Email non vérifié ({statusCounts.pendingOtp})
            </label>
            <label
              className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-lg cursor-pointer transition ${
                statusFilters.pendingApproval
                  ? 'bg-amber-100 text-amber-700 border border-amber-200'
                  : 'bg-slate-100 text-slate-400 border border-slate-200'
              }`}
            >
              <input
                type="checkbox"
                checked={statusFilters.pendingApproval}
                onChange={(e) => setStatusFilters((f) => ({ ...f, pendingApproval: e.target.checked }))}
                className="w-3 h-3"
              />
              ⏳ Non validé ({statusCounts.pendingApproval})
            </label>
            <label
              className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-lg cursor-pointer transition ${
                statusFilters.pendingFiles
                  ? 'bg-violet-100 text-violet-700 border border-violet-200'
                  : 'bg-slate-100 text-slate-400 border border-slate-200'
              }`}
            >
              <input
                type="checkbox"
                checked={statusFilters.pendingFiles}
                onChange={(e) => setStatusFilters((f) => ({ ...f, pendingFiles: e.target.checked }))}
                className="w-3 h-3"
              />
              📁 Fichiers ({statusCounts.pendingFiles})
            </label>
            {statusCounts.dismissed > 0 && (
              <button
                onClick={() => setShowDismissed((s) => !s)}
                className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-lg transition ${
                  showDismissed
                    ? 'bg-slate-700 text-white'
                    : 'bg-slate-100 text-slate-600 border border-slate-200'
                }`}
                title="Afficher/masquer les profs ignorés"
              >
                {showDismissed ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                {showDismissed ? 'Masquer' : 'Afficher'} ignorés ({statusCounts.dismissed})
              </button>
            )}
          </div>
        )}

        {selected.size > 0 && (
          <div className="flex gap-2 animate-in fade-in slide-in-from-end-2 flex-wrap">
            <span className="px-3 py-2 bg-primary-100 text-primary-700 rounded-xl text-sm font-semibold flex items-center">
              {selected.size} sélectionné{selected.size > 1 ? 's' : ''}
            </span>
            {tab === 'teachers' && (
              <button
                onClick={async () => {
                  if (
                    !confirm(
                      `🚮 VIDER LA PAGE\n\n` +
                      `Tu vas masquer ${selected.size} prof(s) de cette page admin.\n\n` +
                      `⚠️ Les comptes restent en base (non supprimés). Ils n'apparaîtront plus dans /admin/approbations ni /admin/verifications.\n\n` +
                      `Continuer ?`,
                    )
                  ) return;
                  setBulkLoading('dismiss');
                  try {
                    const res = await fetch('/api/admin/teachers/bulk-dismiss', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ ids: Array.from(selected) }),
                    });
                    const data = await res.json();
                    if (!res.ok || !data.ok) {
                      toast.error(data.error || 'Erreur');
                      return;
                    }
                    toast.success(`🚮 ${data.dismissed} prof(s) masqué(s) de la page`);
                    setTeachers((ts) => ts.filter((t) => !selected.has(t.id)));
                    setDismissedIds((prev) => {
                      const next = new Set(prev);
                      for (const id of selected) next.add(id);
                      return next;
                    });
                    setSelected(new Set());
                  } catch (e) {
                    toast.error('Erreur réseau');
                  } finally {
                    setBulkLoading(null);
                  }
                }}
                disabled={bulkLoading !== null}
                className="px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white text-sm font-bold rounded-xl transition disabled:opacity-50 flex items-center gap-1.5"
                title="Masquer de cette page (compte préservé en base)"
              >
                {bulkLoading === 'dismiss' ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <EyeOff className="w-4 h-4" />
                )}
                Vider la page
              </button>
            )}
            {tab === 'teachers' && (
              <button
                onClick={async () => {
                  // Compute file count for the confirmation
                  const teachersToDelete = teachers.filter(
                    (t) => selected.has(t.id) && (t as any).role !== 'ADMIN',
                  );
                  const totalResources = teachersToDelete.reduce(
                    (sum, t: any) => sum + (t._count?.uploadedFiles || 0),
                    0,
                  );
                  const totalLibrary = teachersToDelete.reduce(
                    (sum, t: any) => sum + (t._count?.library || 0),
                    0,
                  );
                  const msg =
                    `🗑️ SUPPRESSION DÉFINITIVE\n\n` +
                    `Tu vas supprimer DÉFINITIVEMENT ${teachersToDelete.length} prof(s) :\n` +
                    teachersToDelete
                      .slice(0, 10)
                      .map((t) => `  • ${t.firstName || ''} ${t.lastName || ''} (${t.email})`)
                      .join('\n') +
                    (teachersToDelete.length > 10
                      ? `\n  ... et ${teachersToDelete.length - 10} autres`
                      : '') +
                    `\n\n📁 ${totalResources} ressource(s) uploadée(s) → seront TRANSFÉRÉES à ton compte admin (conservées)\n` +
                    `📚 ${totalLibrary} fichier(s) dans la library → seront supprimés avec le prof\n\n` +
                    `⚠️ Cette action est IRRÉVERSIBLE.\n\n` +
                    `Continuer ?`;
                  if (!confirm(msg)) return;

                  setBulkLoading('reject'); // reuse loading state
                  try {
                    const res = await fetch('/api/admin/teachers/bulk-delete', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ ids: Array.from(selected), keepFiles: true }),
                    });
                    const data = await res.json();
                    if (!res.ok || !data.ok) {
                      toast.error(data.error || 'Erreur lors de la suppression');
                      return;
                    }
                    toast.success(
                      `🗑️ ${data.totalDeleted} prof(s) supprimé(s) — ${data.totalResourcesTransferred} ressource(s) transférée(s)` +
                        (data.totalSkipped > 0 ? `, ${data.totalSkipped} ignoré(s)` : ''),
                    );
                    // Remove deleted teachers from local state
                    setTeachers((ts) => ts.filter((t) => !selected.has(t.id)));
                    setDismissedIds((prev) => {
                      const next = new Set(prev);
                      for (const id of selected) next.add(id);
                      return next;
                    });
                    setSelected(new Set());
                  } catch (e) {
                    toast.error('Erreur réseau');
                  } finally {
                    setBulkLoading(null);
                  }
                }}
                disabled={bulkLoading !== null}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-bold rounded-xl transition disabled:opacity-50 flex items-center gap-1.5 border-2 border-red-700"
                title="Supprimer définitivement (les fichiers sont transférés à ton compte admin)"
              >
                <Trash2 className="w-4 h-4" />
                Supprimer {selected.size} prof{selected.size > 1 ? 's' : ''}
              </button>
            )}
            <button
              onClick={() => handleBulk('approve')}
              disabled={bulkLoading !== null}
              className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-semibold rounded-xl transition disabled:opacity-50 flex items-center gap-1.5"
            >
              {bulkLoading === 'approve' ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <CheckCircle className="w-4 h-4" />
              )}
              Tout approuver
            </button>
            <button
              onClick={() => handleBulk('reject')}
              disabled={bulkLoading !== null}
              className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white text-sm font-semibold rounded-xl transition disabled:opacity-50 flex items-center gap-1.5"
            >
              {bulkLoading === 'reject' ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <XCircle className="w-4 h-4" />
              )}
              Tout rejeter
            </button>
            <button
              onClick={() => setSelected(new Set())}
              className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold rounded-xl"
            >
              Annuler
            </button>
          </div>
        )}
      </div>

      {/* List */}
      {filteredList.length === 0 ? (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-8 text-center">
          <CheckCircle className="w-12 h-12 mx-auto mb-3 text-emerald-500" />
          <p className="font-semibold text-emerald-800 text-lg">
            {currentList.length === 0
              ? tab === 'teachers'
                ? 'Aucun enseignant en attente'
                : 'Aucune ressource en attente'
              : 'Aucun résultat pour cette recherche'}
          </p>
          {currentList.length === 0 && (
            <p className="text-sm text-emerald-700 mt-1">Tout est à jour ! 🎉</p>
          )}
        </div>
      ) : (
        <>
          {/* Select all */}
          <div className="flex items-center gap-2 mb-3 px-3">
            <button
              onClick={toggleSelectAll}
              className="flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-900"
            >
              {selected.size === filteredList.length ? (
                <CheckSquare className="w-5 h-5 text-primary-500" />
              ) : (
                <Square className="w-5 h-5" />
              )}
              {selected.size === filteredList.length ? 'Tout désélectionner' : 'Tout sélectionner'}
            </button>
          </div>

          <div className="space-y-3">
            {filteredList.map((item) => {
              const isTeacher = tab === 'teachers';
              const t = item as Teacher;
              const r = item as Resource;
              const isSelected = selected.has(item.id);
              return (
                <div
                  key={item.id}
                  className={`bg-white rounded-2xl border-2 p-4 transition overflow-hidden ${
                    isSelected
                      ? 'border-primary-400 bg-primary-50/30 shadow-md'
                      : isTeacher
                        ? 'border-amber-200 hover:border-amber-300'
                        : 'border-orange-200 hover:border-orange-300'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row items-start gap-3 min-w-0">
                    {/* Checkbox */}
                    <button onClick={() => toggleSelect(item.id)} className="mt-1 flex-shrink-0">
                      {isSelected ? (
                        <CheckSquare className="w-5 h-5 text-primary-500" />
                      ) : (
                        <Square className="w-5 h-5 text-slate-400 hover:text-slate-600" />
                      )}
                    </button>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      {isTeacher ? (
                        <>
                          <div className="flex items-center gap-2 mb-2">
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 text-white font-bold flex items-center justify-center flex-shrink-0">
                              {t.firstName?.[0]}
                              {t.lastName?.[0]}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="font-bold truncate">
                                {t.firstName} {t.lastName}
                              </div>
                              <div className="text-xs text-slate-500 truncate">{t.email}</div>
                            </div>
                            {/* Status badge */}
                            {t.status === 'PENDING_OTP' && !t.emailVerifiedAt ? (
                              <span
                                className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 border border-orange-200 flex-shrink-0"
                                title="Le prof n'a pas encore vérifié son email"
                              >
                                ✉️ Email non vérifié
                              </span>
                            ) : t.lastInvitationId || t.invitationStatus ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 border border-indigo-200 flex-shrink-0">
                                <Mail className="w-3 h-3" /> Invité
                              </span>
                            ) : t.status === 'PENDING_FILE_VERIFICATION' ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 border border-violet-200 flex-shrink-0">
                                <FolderOpen className="w-3 h-3" /> Fichiers demandés
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200 flex-shrink-0">
                                Nouveau
                              </span>
                            )}
                          </div>
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 text-xs">
                            {t.schoolName && (
                              <div className="bg-slate-50 px-2 py-1 rounded">🏫 {t.schoolName}</div>
                            )}
                            {t.governorate && (
                              <div className="bg-slate-50 px-2 py-1 rounded">
                                📍 {t.governorate}
                              </div>
                            )}
                            {t.diploma && (
                              <div className="bg-slate-50 px-2 py-1 rounded">🎓 {t.diploma}</div>
                            )}
                            {t.teachingSubjects && (
                              <div className="bg-slate-50 px-2 py-1 rounded col-span-2 sm:col-span-3">
                                📚 {t.teachingSubjects}
                              </div>
                            )}
                            <div className="text-slate-400 px-2">⏱️ {t.createdAtLabel}</div>
                            {t.verificationFilesRequestedAt && (
                              <div className="text-violet-600 px-2 col-span-2 sm:col-span-3 flex items-center gap-2 flex-wrap">
                                <span>
                                  📁 Demande envoyée {t.verificationFilesRequestedAtLabel ?? t.verificationFilesRequestedAt}
                                  {t.verificationFilesCount
                                    ? ` • ${t.verificationFilesCount} fichier(s) reçu(s)`
                                    : ' • en attente'}
                                </span>
                                {t.verificationFilesReceivedAt && (
                                  <span className="inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200">
                                    ✓ Complet
                                  </span>
                                )}
                                {t.verificationFilesCount && t.verificationFilesCount > 0 && (
                                  <TeacherVerificationFilesViewer teacherId={t.id} />
                                )}
                              </div>
                            )}
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="flex items-start gap-2 mb-2">
                            <div className="w-10 h-12 bg-slate-100 rounded flex items-center justify-center flex-shrink-0">
                              <FileText className="w-5 h-5 text-slate-400" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="font-bold line-clamp-2 break-words" title={r.title}>
                                {r.title}
                              </div>
                              <div className="text-xs text-slate-500 truncate">
                                {r.subject?.nameFr} · {r.class?.nameFr} · {r.type}
                              </div>
                            </div>
                          </div>
                          {r.description && (
                            <p
                              className="text-sm text-slate-600 mb-2 line-clamp-2"
                              dangerouslySetInnerHTML={{ __html: r.description }}
                            />
                          )}
                          <div className="text-xs text-slate-500 flex flex-wrap gap-x-3">
                            <span>
                              👤 {r.teacher?.firstName} {r.teacher?.lastName}
                            </span>
                            {r.teacher?.schoolName && <span>🏫 {r.teacher.schoolName}</span>}
                            <span>⏱️ {r.createdAtLabel}</span>
                          </div>
                          <a
                            href={r.fileUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-primary-600 hover:underline mt-2"
                          >
                            👁️ Prévisualiser le fichier
                          </a>
                        </>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex flex-row sm:flex-col gap-2 w-full sm:w-auto sm:flex-shrink-0 flex-wrap">
                      <button
                        onClick={() => {
                          // Warn admin if prof hasn't verified their email yet
                          if (t.status === 'PENDING_OTP' && !t.emailVerifiedAt) {
                            const ok = confirm(
                              `⚠️ Le prof n'a pas encore vérifié son email.\n\n` +
                              `Si tu l'approuves maintenant, il pourra se connecter sans avoir vérifié son email (risque sécurité).\n\n` +
                              `Recommandé : clique "Renvoyer l'email" ci-dessous et attends qu'il vérifie.\n\n` +
                              `Approuver quand même ?`,
                            );
                            if (!ok) return;
                          }
                          handleSingle(item.id, 'approve');
                        }}
                        disabled={loading !== null}
                        className="p-2 sm:px-3 sm:py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-xs sm:text-sm font-semibold rounded-lg sm:rounded-xl transition disabled:opacity-50 flex items-center gap-1.5"
                        title="Approuver"
                      >
                        {loading === `${item.id}-approve` ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <CheckCircle className="w-4 h-4" />
                        )}
                        <span className="hidden sm:inline">Approuver</span>
                      </button>
                      {/* Resend verification email button — only for PENDING_OTP teachers */}
                      {isTeacher && t.status === 'PENDING_OTP' && !t.emailVerifiedAt && (
                        <button
                          onClick={async () => {
                            const ok = confirm(
                              `Renvoyer l'email de vérification à ${t.email} ?`,
                            );
                            if (!ok) return;
                            try {
                              const res = await fetch('/api/auth/resend-otp', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ email: t.email }),
                              });
                              const data = await res.json();
                              if (res.ok) {
                                toast.success(`📧 Email de vérification renvoyé à ${t.email}`);
                              } else {
                                toast.error(data.error || 'Erreur');
                              }
                            } catch (e) {
                              toast.error('Erreur réseau');
                            }
                          }}
                          disabled={loading !== null}
                          className="p-2 sm:px-3 sm:py-2 bg-orange-500 hover:bg-orange-600 text-white text-xs sm:text-sm font-semibold rounded-lg sm:rounded-xl transition disabled:opacity-50 flex items-center gap-1.5"
                          title="Renvoyer l'email de vérification"
                        >
                          <Mail className="w-4 h-4" />
                          <span className="hidden sm:inline">Renvoyer</span>
                        </button>
                      )}
                      <button
                        onClick={() => handleSingle(item.id, 'reject')}
                        disabled={loading !== null}
                        className="p-2 sm:px-3 sm:py-2 bg-red-500 hover:bg-red-600 text-white text-xs sm:text-sm font-semibold rounded-lg sm:rounded-xl transition disabled:opacity-50 flex items-center gap-1.5"
                        title="Rejeter"
                      >
                        {loading === `${item.id}-reject` ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <XCircle className="w-4 h-4" />
                        )}
                        <span className="hidden sm:inline">Rejeter</span>
                      </button>
                      {/* "Ignorer ce prof" — cache de l'affichage, préserve les fichiers */}
                      {isTeacher && (
                        <button
                          onClick={() => {
                            const fileCount = (t as any)._count?.uploadedFiles ?? 0;
                            const resourceCount = (t as any)._count?.approvedFiles ?? 0;
                            const totalFiles = fileCount + resourceCount;
                            const msg = totalFiles > 0
                              ? `Ce prof a ${totalFiles} fichier(s) sur la plateforme.\n\n⚠️ "Ignorer" le cache UNIQUEMENT de cet espace admin — ses fichiers restent intacts et les élèves peuvent toujours y accéder.\n\nContinuer ?`
                              : `Ce prof n'a aucun fichier.\n\n"Ignorer" le cache de cet espace admin (peut être ré-affiché plus tard).`;
                            if (!confirm(msg)) return;
                            setDismissedIds((prev) => {
                              const next = new Set(prev);
                              next.add(item.id);
                              return next;
                            });
                            toast.success(`Prof ignoré (${totalFiles > 0 ? `${totalFiles} fichier(s) préservé(s)` : 'aucun fichier'})`);
                          }}
                          disabled={loading !== null}
                          className="p-2 sm:px-3 sm:py-2 bg-slate-500 hover:bg-slate-600 text-white text-xs sm:text-sm font-semibold rounded-lg sm:rounded-xl transition disabled:opacity-50 flex items-center gap-1.5"
                          title="Cacher de l'affichage (les fichiers restent intacts)"
                        >
                          <EyeOff className="w-4 h-4" />
                          <span className="hidden sm:inline">Ignorer</span>
                        </button>
                      )}
                      {/* Request files button — only for non-invited teachers */}
                      {isTeacher && !t.lastInvitationId && !t.invitationStatus && (
                        <button
                          onClick={() => {
                            setFileRequestModal({ teacher: t });
                            setFileRequestNote('');
                          }}
                          disabled={loading !== null}
                          className="p-2 sm:px-3 sm:py-2 bg-violet-500 hover:bg-violet-600 text-white text-xs sm:text-sm font-semibold rounded-lg sm:rounded-xl transition disabled:opacity-50 flex items-center gap-1.5"
                          title="Demander 5 fichiers de vérification"
                        >
                          {loading === `${item.id}-request-files` ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <FolderOpen className="w-4 h-4" />
                          )}
                          <span className="hidden sm:inline">Fichiers</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Reject reason modal */}
      {rejectModal && (
        <div
          role="presentation"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
          onClick={() => setRejectModal(null)}
          onKeyDown={(e) => { if (e.key === 'Escape') setRejectModal(null); }}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <div className="bg-gradient-to-br from-red-500 to-red-700 p-6 text-white">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-white/20 backdrop-blur flex items-center justify-center text-2xl">
                  ❌
                </div>
                <div>
                  <h2 className="text-xl font-extrabold leading-tight">
                    Rejeter{' '}
                    {rejectModal.isBulk ? `${rejectModal.ids.length} ressource(s)` : 'la ressource'}
                  </h2>
                  {rejectModal.itemTitle && !rejectModal.isBulk && (
                    <p className="text-sm text-red-100 mt-1 line-clamp-1">
                      {rejectModal.itemTitle}
                    </p>
                  )}
                </div>
              </div>
            </div>
            <div className="p-6">
              <label htmlFor="rejectReason" className="block text-sm font-semibold text-slate-700 mb-2">
                Motif du refus <span className="text-red-500">*</span>
              </label>
              <textarea id="rejectReason" value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Ex: Le fichier contient des erreurs de mise en page. Veuillez utiliser le format PDF et vérifier l'orthographe avant de re-soumettre."
                className="w-full border-2 border-slate-200 rounded-xl p-3 text-sm focus:border-red-400 focus:ring-4 focus:ring-red-100 outline-none resize-none"
                rows={5}
                maxLength={500}
              />
              <div className="text-xs text-slate-400 mt-1 text-right">
                {rejectReason.length}/500
              </div>
              <p className="text-xs text-slate-500 mt-3">
                💡 Le motif sera envoyé par email au prof et affiché dans sa bibliothèque.
              </p>
            </div>
            <div className="bg-slate-50 px-6 py-4 flex gap-2 justify-end border-t border-slate-100">
              <button
                onClick={() => {
                  setRejectModal(null);
                  setRejectReason('');
                }}
                className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-200 rounded-lg"
                disabled={bulkLoading === 'reject'}
              >
                Annuler
              </button>
              <button
                onClick={confirmReject}
                disabled={!rejectReason.trim() || bulkLoading === 'reject'}
                className="px-4 py-2 text-sm font-bold text-white bg-gradient-to-r from-red-500 to-red-700 hover:from-red-600 hover:to-red-800 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed shadow-md flex items-center gap-2"
              >
                {bulkLoading === 'reject' ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Envoi...
                  </>
                ) : (
                  <>
                    <XCircle className="w-4 h-4" /> Confirmer le refus
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FILE REQUEST modal — for new non-invited teachers */}
      {fileRequestModal && (
        <div
          role="presentation"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
          onClick={() => setFileRequestModal(null)}
          onKeyDown={(e) => { if (e.key === 'Escape') setFileRequestModal(null); }}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <div className="bg-gradient-to-br from-violet-500 via-purple-600 to-amber-500 p-6 text-white">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-white/20 backdrop-blur flex items-center justify-center text-2xl">
                  📁
                </div>
                <div>
                  <h2 className="text-xl font-extrabold leading-tight">
                    Demander 5 fichiers de vérification
                  </h2>
                  <p className="text-sm text-violet-100 mt-1">
                    {fileRequestModal.teacher.firstName} {fileRequestModal.teacher.lastName}
                  </p>
                </div>
              </div>
            </div>
            <div className="p-6">
              <div className="bg-violet-50 border border-violet-200 rounded-xl p-3 mb-4 text-sm text-violet-800">
                <Shield className="w-4 h-4 inline me-1" />
                Cette action enverra un email au prof lui demandant de nous envoyer
                <strong> 5 fichiers Word/PDF d'exemple</strong> avec son nom et prénom.
                <br />
                <span className="text-xs text-violet-600 mt-1 block">
                  Le prof aura 7 jours pour répondre. Son statut passera à
                  <code className="mx-1 px-1 bg-white rounded">PENDING_FILE_VERIFICATION</code>.
                </span>
              </div>

              <label htmlFor="infoMessage" className="block text-sm font-semibold text-slate-700 mb-2">
                Message personnalisé <span className="text-slate-400 font-normal">(optionnel)</span>
              </label>
              <textarea
                value={fileRequestNote}
                onChange={(e) => setFileRequestNote(e.target.value)}
                placeholder="Ex: Bienvenue ! Merci de nous envoyer 5 exemples de vos meilleurs cours/séries en français et en arabe. Mettez votre nom en pied de page de chaque fichier."
                className="w-full border-2 border-slate-200 rounded-xl p-3 text-sm focus:border-violet-400 focus:ring-4 focus:ring-violet-100 outline-none resize-none"
                rows={5}
                maxLength={500}
              />
              <div className="text-xs text-slate-400 mt-1 text-right">
                {fileRequestNote.length}/500
              </div>
            </div>
            <div className="bg-slate-50 px-6 py-4 flex gap-2 justify-end border-t border-slate-100">
              <button
                onClick={() => {
                  setFileRequestModal(null);
                  setFileRequestNote('');
                }}
                className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-200 rounded-lg"
                disabled={loading?.endsWith('-request-files')}
              >
                Annuler
              </button>
              <button
                onClick={() =>
                  handleRequestFiles(fileRequestModal.teacher, fileRequestNote.trim() || null)
                }
                disabled={loading?.endsWith('-request-files')}
                className="px-4 py-2 text-sm font-bold text-white bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700 rounded-lg disabled:opacity-50 shadow-md flex items-center gap-2"
              >
                {loading?.endsWith('-request-files') ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Envoi...
                  </>
                ) : (
                  <>
                    <Mail className="w-4 h-4" /> Envoyer la demande
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
