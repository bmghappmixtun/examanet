'use client';
// 2026-09-15: Bulk moderation actions — checkbox per row, select-all in header,
// and per-row "Marquer traité" / "Supprimer" buttons.
// All admin-only actions go through /api/admin/reports/* endpoints.
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { Flag, AlertTriangle, CheckCircle, FileText, Clock, ExternalLink, Trash2, CheckCheck, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { timeAgo } from '@/lib/utils';

const REASON_LABELS: Record<string, string> = {
  INAPPROPRIATE: 'Contenu inapproprié',
  COPYRIGHT: "Violation de droits d'auteur",
  SPAM: 'Spam / Publicité',
  WRONG_CONTENT: 'Contenu erroné',
  BROKEN_FILE: 'Fichier cassé',
  OTHER: 'Autre',
};

const REASON_COLORS: Record<string, string> = {
  INAPPROPRIATE: 'bg-red-100 text-red-700',
  COPYRIGHT: 'bg-purple-100 text-purple-700',
  SPAM: 'bg-orange-100 text-orange-700',
  WRONG_CONTENT: 'bg-amber-100 text-amber-700',
  BROKEN_FILE: 'bg-yellow-100 text-yellow-700',
  OTHER: 'bg-slate-100 text-slate-700',
};

export interface ReportRow {
  id: string;
  resourceId: string;
  userId: string | null;
  reason: string;
  details: string | null;
  status: string;
  reviewedById: string | null;
  reviewedAt: number | null;
  createdAt: number;
  resourceTitle: string | null;
  resourceNumericId: number | null;
  resourceSlug: string | null;
  resourceSubject: string | null;
  reporterFirstName: string | null;
  reporterLastName: string | null;
  reporterEmail: string | null;
}

export default function ModerationClient({
  initialPending,
  initialResolved,
  totalReports,
}: {
  initialPending: ReportRow[];
  initialResolved: ReportRow[];
  totalReports: number;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(initialPending);
  const [resolved] = useState(initialResolved);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null); // single id being processed
  const [bulkBusy, setBulkBusy] = useState(false);
  const [, startTransition] = useTransition();

  const allSelected = pending.length > 0 && selected.size === pending.length;
  const someSelected = selected.size > 0 && selected.size < pending.length;

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) =>
      prev.size === pending.length ? new Set() : new Set(pending.map((r) => r.id)),
    );
  }

  async function callApi(path: string, body?: any): Promise<any> {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || `Erreur ${res.status}`);
    return data;
  }

  async function resolveOne(id: string) {
    setBusy(id);
    try {
      await callApi(`/api/admin/reports/${id}/resolve`);
      setPending((prev) => prev.filter((r) => r.id !== id));
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      toast.success('Marqué comme traité ✓');
      startTransition(() => router.refresh());
    } catch (e: any) {
      toast.error(e?.message || 'Erreur');
    } finally {
      setBusy(null);
    }
  }

  async function deleteOne(id: string) {
    if (!confirm('Supprimer ce signalement définitivement ?')) return;
    setBusy(id);
    try {
      await callApi(`/api/admin/reports/${id}/delete`);
      setPending((prev) => prev.filter((r) => r.id !== id));
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      toast.success('Supprimé ✓');
      startTransition(() => router.refresh());
    } catch (e: any) {
      toast.error(e?.message || 'Erreur');
    } finally {
      setBusy(null);
    }
  }

  async function bulkAction(action: 'resolve' | 'delete') {
    const ids = Array.from(selected);
    if (ids.length === 0) {
      toast.error('Sélectionnez au moins un signalement');
      return;
    }
    const verb = action === 'resolve' ? 'marquer comme traité' : 'supprimer';
    if (!confirm(`${verb} ${ids.length} signalement(s) ?`)) return;

    setBulkBusy(true);
    try {
      const result = await callApi('/api/admin/reports/bulk', { action, ids });
      setPending((prev) => prev.filter((r) => !selected.has(r.id)));
      setSelected(new Set());
      toast.success(
        action === 'resolve'
          ? `${result.affected} marqué(s) comme traité ✓`
          : `${result.affected} supprimé(s) ✓`,
      );
      startTransition(() => router.refresh());
    } catch (e: any) {
      toast.error(e?.message || 'Erreur');
    } finally {
      setBulkBusy(false);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-extrabold mb-6 flex items-center gap-2">
        <Flag className="w-6 h-6 text-red-500" /> Modération
      </h1>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        <div className="bg-white rounded-xl p-5 border border-slate-100">
          <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center mb-3">
            <Clock className="w-5 h-5 text-amber-600" />
          </div>
          <div className="text-2xl font-extrabold">{pending.length}</div>
          <div className="text-sm font-semibold text-slate-700">Signalements en attente</div>
        </div>
        <div className="bg-white rounded-xl p-5 border border-slate-100">
          <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center mb-3">
            <CheckCircle className="w-5 h-5 text-emerald-600" />
          </div>
          <div className="text-2xl font-extrabold">{resolved.length}+</div>
          <div className="text-sm font-semibold text-slate-700">Traités récemment</div>
        </div>
        <div className="bg-white rounded-xl p-5 border border-slate-100 col-span-2 lg:col-span-1">
          <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center mb-3">
            <Flag className="w-5 h-5 text-slate-600" />
          </div>
          <div className="text-2xl font-extrabold">{totalReports}</div>
          <div className="text-sm font-semibold text-slate-700">Total historique</div>
        </div>
      </div>

      {/* Pending reports */}
      <div className="mb-10">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-500" /> En attente ({pending.length})
          </h2>
          {/* Bulk action bar — appears when at least one row is selected */}
          {selected.size > 0 && (
            <div className="flex items-center gap-2 bg-sky-50 border border-sky-200 rounded-xl px-3 py-2">
              <span className="text-sm font-semibold text-sky-900">
                {selected.size} sélectionné{selected.size > 1 ? 's' : ''}
              </span>
              <button
                onClick={() => bulkAction('resolve')}
                disabled={bulkBusy}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-semibold hover:bg-emerald-700 disabled:opacity-50"
              >
                {bulkBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCheck className="w-3.5 h-3.5" />}
                Marquer comme traités
              </button>
              <button
                onClick={() => bulkAction('delete')}
                disabled={bulkBusy}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-600 text-white rounded-lg text-xs font-semibold hover:bg-red-700 disabled:opacity-50"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Supprimer
              </button>
              <button
                onClick={() => setSelected(new Set())}
                className="text-xs text-slate-600 hover:text-slate-900 px-2"
              >
                Annuler
              </button>
            </div>
          )}
        </div>

        {pending.length === 0 ? (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-8 text-center">
            <CheckCircle className="w-12 h-12 mx-auto mb-3 text-emerald-500" />
            <h3 className="font-bold text-lg text-emerald-800 mb-1">Tout est propre !</h3>
            <p className="text-emerald-600 text-sm">Aucun signalement en attente.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Select-all row */}
            <div className="bg-white rounded-2xl border border-slate-200 p-3 flex items-center gap-3">
              <input
                type="checkbox"
                checked={allSelected}
                ref={(el) => { if (el) el.indeterminate = someSelected; }}
                onChange={toggleAll}
                className="w-4 h-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500 cursor-pointer"
              />
              <label className="text-sm font-semibold text-slate-700 cursor-pointer" onClick={toggleAll}>
                {allSelected ? 'Tout désélectionner' : 'Tout sélectionner'} ({pending.length})
              </label>
            </div>

            {pending.map((rep) => {
              const isSelected = selected.has(rep.id);
              const isBusy = busy === rep.id;
              return (
                <div
                  key={rep.id}
                  className={`bg-white rounded-2xl border p-5 transition ${
                    isSelected ? 'border-sky-400 ring-2 ring-sky-100' : 'border-amber-200'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {/* Checkbox */}
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleOne(rep.id)}
                      className="w-4 h-4 mt-1 rounded border-slate-300 text-sky-600 focus:ring-sky-500 cursor-pointer flex-shrink-0"
                    />

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <span
                          className={`px-2 py-1 text-xs font-bold rounded ${REASON_COLORS[rep.reason] || 'bg-slate-100 text-slate-700'}`}
                        >
                          {REASON_LABELS[rep.reason] || rep.reason}
                        </span>
                        <span className="text-xs text-slate-500">{timeAgo(rep.createdAt)}</span>
                      </div>
                      {rep.resourceTitle && (
                        rep.resourceNumericId && rep.resourceSlug ? (
                          <Link
                            href={`/fr/ressources/${rep.resourceNumericId}/${rep.resourceSlug}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-3 mb-2 p-2 -m-2 rounded-lg hover:bg-sky-50 hover:ring-1 hover:ring-sky-200 transition group"
                          >
                            <div className="w-8 h-10 bg-slate-100 rounded flex items-center justify-center flex-shrink-0 group-hover:bg-sky-100 transition">
                              <FileText className="w-4 h-4 text-slate-400 group-hover:text-sky-600 transition" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="font-semibold text-sm truncate text-sky-700 group-hover:text-sky-900 group-hover:underline">
                                {rep.resourceTitle}
                              </div>
                              <div className="text-xs text-slate-500">{rep.resourceSubject}</div>
                            </div>
                            <ExternalLink className="w-4 h-4 text-slate-400 group-hover:text-sky-600 transition flex-shrink-0" />
                          </Link>
                        ) : (
                          <div className="flex items-center gap-3 mb-2">
                            <div className="w-8 h-10 bg-slate-100 rounded flex items-center justify-center flex-shrink-0">
                              <FileText className="w-4 h-4 text-slate-400" />
                            </div>
                            <div className="min-w-0">
                              <div className="font-semibold text-sm truncate">{rep.resourceTitle}</div>
                              <div className="text-xs text-slate-500">{rep.resourceSubject}</div>
                            </div>
                          </div>
                        )
                      )}
                      {rep.details && (
                        <p className="text-sm text-slate-700 bg-slate-50 rounded-lg p-3 mb-2 whitespace-pre-wrap">
                          « {rep.details} »
                        </p>
                      )}
                      <div className="text-xs text-slate-500 mb-3">
                        Signalé par{' '}
                        {rep.reporterFirstName || rep.reporterLastName ? (
                          <span className="font-semibold">
                            {rep.reporterFirstName || ''} {rep.reporterLastName || ''}
                          </span>
                        ) : (
                          <span className="font-semibold italic text-slate-400">Utilisateur supprimé</span>
                        )}
                        {rep.reporterEmail && (
                          <span className="text-slate-400"> ({rep.reporterEmail})</span>
                        )}
                      </div>
                      {/* Per-row actions */}
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => resolveOne(rep.id)}
                          disabled={isBusy || bulkBusy}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg text-xs font-semibold hover:bg-emerald-100 disabled:opacity-50"
                        >
                          {isBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
                          Marquer comme traité
                        </button>
                        <button
                          onClick={() => deleteOne(rep.id)}
                          disabled={isBusy || bulkBusy}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-50 text-red-700 border border-red-200 rounded-lg text-xs font-semibold hover:bg-red-100 disabled:opacity-50"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Supprimer
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Resolved reports */}
      {resolved.length > 0 && (
        <div>
          <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-emerald-500" /> Traités récemment
          </h2>
          <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">Raison</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">Ressource</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600 hidden sm:table-cell">
                    Signalé par
                  </th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">Statut</th>
                </tr>
              </thead>
              <tbody>
                {resolved.map((rep) => (
                  <tr key={rep.id} className="border-t border-slate-50">
                    <td className="px-4 py-3">
                      <span
                        className={`px-2 py-1 text-xs font-bold rounded ${REASON_COLORS[rep.reason] || 'bg-slate-100 text-slate-700'}`}
                      >
                        {REASON_LABELS[rep.reason] || rep.reason}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm font-medium truncate max-w-xs">
                      {rep.resourceTitle ? (
                        rep.resourceNumericId && rep.resourceSlug ? (
                          <Link
                            href={`/fr/ressources/${rep.resourceNumericId}/${rep.resourceSlug}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sky-700 hover:text-sky-900 hover:underline inline-flex items-center gap-1"
                          >
                            <span className="truncate">{rep.resourceTitle}</span>
                            <ExternalLink className="w-3 h-3 flex-shrink-0" />
                          </Link>
                        ) : (
                          <span>{rep.resourceTitle}</span>
                        )
                      ) : (
                        <span className="text-slate-400 italic">Ressource supprimée</span>
                      )}
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell text-xs text-slate-500">
                      {rep.reporterFirstName} {rep.reporterLastName}
                    </td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-1 text-xs font-bold rounded bg-emerald-100 text-emerald-700">
                        {rep.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
