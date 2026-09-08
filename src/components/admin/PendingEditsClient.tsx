'use client';
import { useState, useMemo } from 'react';
import {
  CheckCircle2,
  XCircle,
  Loader2,
  Eye,
  Download,
  FileText,
  Clock,
  User as UserIcon,
  Calendar,
  Filter,
  X,
} from 'lucide-react';
import EditReviewActions from './EditReviewActions';
import toast from 'react-hot-toast';

type PendingEdit = {
  id: string;
  numericId: number;
  slug: string;
  title: string;
  type: string;
  status: string;
  editRequestedAt: number | null;
  editRequestedById: string | null;
  editRequestedByName: string | null;
  editRequestedByEmail: string | null;
  teacherName: string | null;
  teacherEmail: string | null;
  // Current file (what's published now)
  currentFileKey: string | null;
  currentFileUrl: string | null;
  currentFileSize: number | null;
  currentPageCount: number | null;
  // Proposed file (what the teacher wants to replace it with)
  pendingFileKey: string | null;
  pendingFileUrl: string | null;
  pendingFileSize: number | null;
  pendingPageCount: number | null;
  // Context
  subjectNameFr: string | null;
  subjectColor: string | null;
  classNameFr: string | null;
  sectionNameFr: string | null;
};

const TYPE_LABELS: Record<string, { label: string; icon: string }> = {
  COURSE: { label: '📖 Cours', icon: '📖' },
  DEVOIR: { label: '📝 Devoir', icon: '📝' },
  EXERCISE: { label: '✏️ Exercice', icon: '✏️' },
  SERIES: { label: '📚 Série', icon: '📚' },
  BAC_SUBJECT: { label: '🎓 Sujet Bac', icon: '🎓' },
  CORRECTION: { label: '✅ Corrigé', icon: '✅' },
  SUMMARY: { label: '📄 Résumé', icon: '📄' },
  CARD: { label: '🗂️ Fiche', icon: '🗂️' },
};

function formatFileSize(bytes: number | null | undefined): string {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function timeAgo(ms: number | null | undefined): string {
  if (!ms) return '—';
  const diff = Date.now() - ms;
  if (diff < 60_000) return 'il y a quelques secondes';
  if (diff < 3_600_000) return `il y a ${Math.floor(diff / 60_000)} min`;
  if (diff < 86_400_000) return `il y a ${Math.floor(diff / 3_600_000)} h`;
  if (diff < 604_800_000) return `il y a ${Math.floor(diff / 86_400_000)} j`;
  return new Date(ms).toLocaleDateString('fr-FR');
}

export default function PendingEditsClient({
  pendingEdits,
  recentlyRejected,
}: {
  pendingEdits: PendingEdit[];
  recentlyRejected: PendingEdit[];
}) {
  const [typeFilter, setTypeFilter] = useState<string>('ALL');
  const [showRejected, setShowRejected] = useState(false);

  const filteredEdits = useMemo(() => {
    if (typeFilter === 'ALL') return pendingEdits;
    return pendingEdits.filter((e) => e.type === typeFilter);
  }, [pendingEdits, typeFilter]);

  // Get unique types for filter
  const types = useMemo(() => {
    const set = new Set(pendingEdits.map((e) => e.type));
    return Array.from(set);
  }, [pendingEdits]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900">✏️ Modifications en attente</h1>
          <p className="text-slate-500 mt-1">
            Approuvez ou refusez les modifications proposées par les enseignants.
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="text-4xl font-extrabold text-blue-600">{pendingEdits.length}</div>
            <div className="text-xs text-slate-500">en attente</div>
          </div>
        </div>
      </div>

      {/* Filters */}
      {pendingEdits.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 p-4 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <Filter className="w-4 h-4" />
            <span className="font-semibold">Filtrer par type :</span>
          </div>
          <button
            onClick={() => setTypeFilter('ALL')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
              typeFilter === 'ALL'
                ? 'bg-blue-600 text-white shadow-md'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            Tous ({pendingEdits.length})
          </button>
          {types.map((t) => {
            const count = pendingEdits.filter((e) => e.type === t).length;
            const meta = TYPE_LABELS[t] || { label: t, icon: '📄' };
            return (
              <button
                key={t}
                onClick={() => setTypeFilter(t)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                  typeFilter === t
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {meta.icon} {meta.label.replace(/^.+ /, '')} ({count})
              </button>
            );
          })}
        </div>
      )}

      {/* Pending edits list */}
      {pendingEdits.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
          <CheckCircle2 className="w-16 h-16 mx-auto mb-4 text-emerald-300" />
          <h3 className="font-bold text-xl mb-2">Tout est à jour !</h3>
          <p className="text-slate-500">
            Aucune modification en attente d'approbation.
          </p>
          {recentlyRejected.length > 0 && (
            <button
              onClick={() => setShowRejected(true)}
              className="mt-4 text-sm text-blue-600 hover:underline"
            >
              Voir les {recentlyRejected.length} rejets récents →
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filteredEdits.map((edit) => {
            const typeMeta = TYPE_LABELS[edit.type] || { label: edit.type, icon: '📄' };
            const sizeDiff =
              edit.pendingFileSize && edit.currentFileSize
                ? edit.pendingFileSize - edit.currentFileSize
                : null;
            return (
              <div
                key={edit.id}
                className="bg-white rounded-2xl border-2 border-blue-200 p-5 hover:shadow-md transition"
              >
                {/* Title + status */}
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                      <span className="px-2.5 py-1 bg-blue-50 text-blue-700 text-[10px] font-bold uppercase tracking-wider rounded-full">
                        {typeMeta.icon} {typeMeta.label.replace(/^.+ /, '')}
                      </span>
                      {edit.classNameFr && (
                        <span className="px-2.5 py-1 bg-slate-100 text-slate-700 text-[10px] font-bold uppercase tracking-wider rounded-full">
                          {edit.classNameFr}
                        </span>
                      )}
                      {edit.sectionNameFr && (
                        <span className="px-2.5 py-1 bg-slate-100 text-slate-700 text-[10px] font-bold uppercase tracking-wider rounded-full">
                          {edit.sectionNameFr}
                        </span>
                      )}
                      {edit.subjectNameFr && (
                        <span
                          className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded-full"
                          style={{
                            background: `${edit.subjectColor || '#0EA5E9'}15`,
                            color: edit.subjectColor || '#0EA5E9',
                          }}
                        >
                          📄 {edit.subjectNameFr}
                        </span>
                      )}
                      <span className="px-2.5 py-1 bg-amber-100 text-amber-800 text-[10px] font-bold uppercase tracking-wider rounded-full inline-flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {timeAgo(edit.editRequestedAt)}
                      </span>
                    </div>
                    <a
                      href={`/fr/ressources/${edit.numericId}/${edit.slug}`}
                      target="_blank"
                      rel="noopener"
                      className="text-base font-bold text-slate-900 hover:text-blue-600 transition"
                    >
                      {edit.title}
                    </a>
                    {edit.teacherName && (
                      <div className="mt-1 text-xs text-slate-500 inline-flex items-center gap-1.5">
                        <UserIcon className="w-3 h-3" />
                        Proposé par <strong className="text-slate-700">{edit.teacherName}</strong>
                        {edit.teacherEmail && <span className="text-slate-400">({edit.teacherEmail})</span>}
                      </div>
                    )}
                  </div>
                </div>

                {/* Diff: current vs proposed */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                  {/* Current file */}
                  <div className="bg-slate-50 rounded-xl p-3 border border-slate-200">
                    <div className="flex items-center gap-1.5 mb-2 text-xs font-bold text-slate-500 uppercase tracking-wider">
                      <FileText className="w-3.5 h-3.5" />
                      Fichier actuel (publié)
                    </div>
                    {edit.currentFileKey ? (
                      <div className="space-y-1.5">
                        <div className="text-sm font-mono text-slate-700 break-all">
                          {edit.currentFileKey.split('/').pop()}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-slate-500">
                          <span>📦 {formatFileSize(edit.currentFileSize)}</span>
                          {edit.currentPageCount && <span>📄 {edit.currentPageCount} pages</span>}
                        </div>
                        {edit.currentFileUrl && (
                          <a
                            href={edit.currentFileUrl}
                            target="_blank"
                            rel="noopener"
                            className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline mt-1"
                          >
                            <Eye className="w-3 h-3" /> Voir
                          </a>
                        )}
                      </div>
                    ) : (
                      <div className="text-xs text-slate-400 italic">Aucun fichier</div>
                    )}
                  </div>

                  {/* Proposed file */}
                  <div className="bg-emerald-50 rounded-xl p-3 border-2 border-emerald-200">
                    <div className="flex items-center gap-1.5 mb-2 text-xs font-bold text-emerald-700 uppercase tracking-wider">
                      <FileText className="w-3.5 h-3.5" />
                      Fichier proposé ✨
                    </div>
                    {edit.pendingFileKey ? (
                      <div className="space-y-1.5">
                        <div className="text-sm font-mono text-slate-700 break-all">
                          {edit.pendingFileKey.split('/').pop()}
                        </div>
                        <div className="flex items-center gap-3 text-xs">
                          <span className="text-slate-500">📦 {formatFileSize(edit.pendingFileSize)}</span>
                          {edit.pendingPageCount && <span className="text-slate-500">📄 {edit.pendingPageCount} pages</span>}
                          {sizeDiff !== null && sizeDiff !== 0 && (
                            <span
                              className={`font-bold ${
                                sizeDiff > 0 ? 'text-amber-700' : 'text-emerald-700'
                              }`}
                            >
                              {sizeDiff > 0 ? '+' : ''}
                              {formatFileSize(Math.abs(sizeDiff))}
                            </span>
                          )}
                        </div>
                        {edit.pendingFileUrl && (
                          <a
                            href={edit.pendingFileUrl}
                            target="_blank"
                            rel="noopener"
                            className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline mt-1"
                          >
                            <Eye className="w-3 h-3" /> Prévisualiser
                          </a>
                        )}
                      </div>
                    ) : (
                      <div className="text-xs text-slate-400 italic">Aucun fichier proposé</div>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <EditReviewActions
                  resourceId={edit.id}
                  resourceTitle={edit.title}
                />
              </div>
            );
          })}
        </div>
      )}

      {/* Recently rejected */}
      {recentlyRejected.length > 0 && (
        <div className="mt-8 space-y-3">
          <button
            onClick={() => setShowRejected(!showRejected)}
            className="flex items-center gap-2 text-lg font-bold text-slate-700 hover:text-slate-900"
          >
            🕒 Rejetés récemment ({recentlyRejected.length})
            <span className="text-xs text-slate-500 font-normal">
              {showRejected ? '(masquer)' : '(afficher)'}
            </span>
          </button>
          {showRejected && (
            <div className="space-y-2">
              {recentlyRejected.map((edit) => (
                <div
                  key={edit.id}
                  className="bg-slate-50 rounded-xl border border-slate-200 p-3 opacity-75"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-bold text-slate-700 truncate">
                        {edit.title}
                      </div>
                      <div className="text-xs text-slate-500">
                        {edit.teacherName} • {timeAgo(edit.editRequestedAt)}
                      </div>
                    </div>
                    <a
                      href={`/fr/ressources/${edit.numericId}/${edit.slug}`}
                      target="_blank"
                      rel="noopener"
                      className="text-xs text-blue-600 hover:underline"
                    >
                      Voir →
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
