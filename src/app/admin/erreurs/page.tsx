'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { 
  AlertTriangle, CheckCircle, Clock, Mail, User, Globe, 
  RefreshCw, Filter, ExternalLink, X, ChevronDown, ChevronRight,
  Activity, Server, AlertOctagon, Info, Search, Trash2
} from 'lucide-react';

type Period = '1h' | '24h' | '7d' | '30d';
type Source = 'all' | 'errorlog' | 'vercellog';
type Severity = 'all' | 'CRITICAL' | 'ERROR' | 'WARNING' | 'INFO' | 'DEBUG';

interface ErrorLog {
  id: string;
  reference: string;
  source: 'CLIENT' | 'SERVER' | 'BUILD' | 'CRON' | 'EXTERNAL';
  severity: 'CRITICAL' | 'ERROR' | 'WARNING' | 'INFO' | 'DEBUG';
  message: string;
  url?: string;
  method?: string;
  requestId?: string;
  region?: string;
  userId?: string;
  userEmail?: string;
  context?: any;
  createdAt: string;
  resolved?: boolean;
}

interface VercelLog {
  id: string;
  level: string;
  requestMethod?: string;
  requestPath?: string;
  responseStatusCode?: number;
  requestId?: string;
  deploymentId?: string;
  environment?: string;
  message: string;
  timestamp: string;
  reviewed?: boolean;
}

interface ApiResponse {
  ok: boolean;
  range: { since: string; until: string };
  counts: { level: string; count: number }[];
  logs: (ErrorLog | VercelLog)[];
}

const PERIOD_MS: Record<Period, number> = {
  '1h': 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
};

const PERIOD_LABEL: Record<Period, string> = {
  '1h': 'Dernière heure',
  '24h': '24 dernières heures',
  '7d': '7 derniers jours',
  '30d': '30 derniers jours',
};

export default function AdminErrorsPage() {
  const [period, setPeriod] = useState<Period>('24h');
  const [source, setSource] = useState<Source>('all');
  const [severity, setSeverity] = useState<Severity>('all');
  const [search, setSearch] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshInterval, setRefreshInterval] = useState(10); // seconds
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [data, setData] = useState<{ errorlog: ErrorLog[]; vercellog: VercelLog[]; counts: { level: string; count: number }[] }>({
    errorlog: [],
    vercellog: [],
    counts: [],
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Clear history dialog state
  const [clearDialog, setClearDialog] = useState(false);
  const [clearSource, setClearSource] = useState<'all' | 'vercel' | 'errorlog'>('all');
  const [clearDays, setClearDays] = useState<number | null>(null);
  const [clearing, setClearing] = useState(false);
  const [preview, setPreview] = useState<{ vercel: number; errorlog: number } | null>(null);

  // Fetch function
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Fetch both sources in parallel
      const [errorlogRes, vercRes] = await Promise.all([
        source !== 'vercellog' ? fetchErrorlog(period, severity) : Promise.resolve({ logs: [], counts: [] }),
        source !== 'errorlog' ? fetchVercelLog(period) : Promise.resolve({ logs: [], counts: [] }),
      ]);
      setData({
        errorlog: errorlogRes.logs as ErrorLog[],
        vercellog: vercRes.logs as VercelLog[],
        counts: [...errorlogRes.counts, ...vercRes.counts],
      });
      setLastUpdated(new Date());
    } catch (e: any) {
      setError(e.message || 'Erreur de chargement');
    } finally {
      setLoading(false);
    }
  }, [period, source, severity]);

  // Preview what will be deleted
  const openClearDialog = useCallback(async () => {
    setClearDialog(true);
    setPreview(null);
    try {
      const params = new URLSearchParams();
      params.set('source', clearSource);
      if (clearDays != null) params.set('olderThanDays', String(clearDays));
      const res = await fetch(`/api/admin/logs/clear?${params}`);
      if (res.ok) {
        const d = await res.json();
        setPreview(d.wouldDelete);
      }
    } catch {}
  }, [clearSource, clearDays]);

  // Refresh preview when filters change
  useEffect(() => {
    if (!clearDialog) return;
    openClearDialog();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clearSource, clearDays, clearDialog]);

  const confirmClear = useCallback(async () => {
    setClearing(true);
    try {
      const res = await fetch('/api/admin/logs/clear', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: clearSource, olderThanDays: clearDays }),
      });
      if (!res.ok) throw new Error('Suppression échouée');
      const d = await res.json();
      setClearDialog(false);
      // Refresh data
      await fetchData();
      alert(`✓ ${d.deleted.vercel} entrée(s) Vercel + ${d.deleted.errorlog} entrée(s) ErrorLog supprimées`);
    } catch (e: any) {
      alert('Erreur : ' + e.message);
    } finally {
      setClearing(false);
    }
  }, [clearSource, clearDays, fetchData]);

  // Initial + auto-refresh
  useEffect(() => {
    fetchData();
    if (!autoRefresh) return;
    const t = setInterval(fetchData, refreshInterval * 1000);
    return () => clearInterval(t);
  }, [fetchData, autoRefresh, refreshInterval]);

  // Filter by search
  const filteredErrorlog = useMemo(() => {
    if (!search) return data.errorlog;
    const s = search.toLowerCase();
    return data.errorlog.filter(e =>
      e.message?.toLowerCase().includes(s) ||
      e.url?.toLowerCase().includes(s) ||
      e.reference?.toLowerCase().includes(s) ||
      e.userEmail?.toLowerCase().includes(s) ||
      e.requestId?.toLowerCase().includes(s)
    );
  }, [data.errorlog, search]);

  const filteredVercelLog = useMemo(() => {
    if (!search) return data.vercellog;
    const s = search.toLowerCase();
    return data.vercellog.filter(e =>
      e.message?.toLowerCase().includes(s) ||
      e.requestPath?.toLowerCase().includes(s) ||
      e.requestId?.toLowerCase().includes(s) ||
      e.level?.toLowerCase().includes(s)
    );
  }, [data.vercellog, search]);

  // Combined count
  const totalCount = filteredErrorlog.length + filteredVercelLog.length;
  const errorCount = data.errorlog.filter(e => e.severity === 'ERROR' || e.severity === 'CRITICAL').length
    + data.vercellog.filter(e => e.level === 'error').length;

  // Mark as resolved
  const markResolved = async (id: string) => {
    try {
      await fetch(`/api/admin/logs/${id}/resolve`, { method: 'POST' });
      fetchData();
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-4 sm:p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 flex items-center gap-2">
              <Activity className="w-7 h-7 text-primary-600" />
              Logs d'erreurs
            </h1>
            <p className="text-sm text-slate-600 mt-1">
              {errorCount > 0 ? (
                <span className="text-red-600 font-semibold">
                  {errorCount} erreur{errorCount > 1 ? 's' : ''} active{errorCount > 1 ? 's' : ''}
                </span>
              ) : (
                <span className="text-emerald-600 font-semibold">✓ Aucune erreur active</span>
              )}
              {' · '}
              <span className="text-slate-500">
                {totalCount} entrée{totalCount > 1 ? 's' : ''} sur {PERIOD_LABEL[period].toLowerCase()}
              </span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/admin"
              className="px-3 py-2 text-sm text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition"
            >
              ← Admin
            </Link>
            <button
              onClick={fetchData}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Rafraîchir
            </button>
            <button
              onClick={openClearDialog}
              disabled={totalCount === 0}
              className="flex items-center gap-1.5 px-3 py-2 text-sm bg-white text-red-700 border border-red-200 hover:bg-red-50 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
              title="Supprimer l'historique"
            >
              <Trash2 className="w-4 h-4" />
              <span className="hidden sm:inline">Vider l'historique</span>
            </button>
          </div>
        </div>

        {/* Clear history dialog */}
        {clearDialog && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Trash2 className="w-5 h-5 text-red-600" />
                Supprimer l'historique
              </h3>
              <p className="text-sm text-slate-600 mt-2">
                Cette action est <strong>irréversible</strong>. Toutes les entrées correspondant aux critères ci-dessous seront définitivement supprimées.
              </p>

              <div className="mt-4 space-y-3">
                <div>
                  <label className="text-sm font-medium text-slate-700">Source</label>
                  <select
                    value={clearSource}
                    onChange={e => setClearSource(e.target.value as 'all' | 'vercel' | 'errorlog')}
                    className="mt-1 w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  >
                    <option value="all">Toutes ({preview?.vercel != null && preview?.errorlog != null ? preview.vercel + preview.errorlog : '…'} entrées)</option>
                    <option value="vercel">Vercel uniquement ({preview?.vercel ?? '…'})</option>
                    <option value="errorlog">ErrorLog uniquement ({preview?.errorlog ?? '…'})</option>
                  </select>
                </div>

                <div>
                  <label className="text-sm font-medium text-slate-700">Ancienneté</label>
                  <select
                    value={clearDays ?? ''}
                    onChange={e => setClearDays(e.target.value === '' ? null : Number(e.target.value))}
                    className="mt-1 w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  >
                    <option value="">Tout supprimer</option>
                    <option value="1">Plus d'1 jour</option>
                    <option value="7">Plus de 7 jours</option>
                    <option value="30">Plus de 30 jours</option>
                  </select>
                </div>

                {preview && (
                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm">
                    <strong>Suppression prévue :</strong>
                    <ul className="mt-1 text-slate-600">
                      {clearSource !== 'errorlog' && <li>• {preview.vercel} entrée(s) Vercel</li>}
                      {clearSource !== 'vercel' && <li>• {preview.errorlog} entrée(s) ErrorLog</li>}
                    </ul>
                  </div>
                )}
              </div>

              <div className="mt-6 flex justify-end gap-2">
                <button
                  onClick={() => setClearDialog(false)}
                  className="px-4 py-2 text-sm bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition"
                >
                  Annuler
                </button>
                <button
                  onClick={confirmClear}
                  disabled={clearing}
                  className="flex items-center gap-1.5 px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 transition disabled:opacity-50"
                >
                  <Trash2 className="w-4 h-4" />
                  {clearing ? 'Suppression…' : 'Supprimer définitivement'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Filters bar */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 mb-4 shadow-sm">
          <div className="flex flex-col lg:flex-row gap-3">
            {/* Search */}
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Rechercher (message, URL, email, requestId...)"
                className="w-full ps-10 pe-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>

            {/* Period */}
            <div className="flex gap-1 bg-slate-100 p-1 rounded-lg">
              {(['1h', '24h', '7d', '30d'] as Period[]).map(p => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md transition ${
                    period === p 
                      ? 'bg-white text-primary-700 shadow-sm' 
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>

            {/* Source */}
            <select
              value={source}
              onChange={e => setSource(e.target.value as Source)}
              className="px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="all">Toutes sources</option>
              <option value="errorlog">ErrorLog (custom)</option>
              <option value="vercellog">VercelLog (runtime)</option>
            </select>

            {/* Severity */}
            <select
              value={severity}
              onChange={e => setSeverity(e.target.value as Severity)}
              className="px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="all">Toutes sévérités</option>
              <option value="CRITICAL">🔴 Critical</option>
              <option value="ERROR">🟠 Error</option>
              <option value="WARNING">🟡 Warning</option>
              <option value="INFO">🔵 Info</option>
              <option value="DEBUG">⚪ Debug</option>
            </select>
          </div>

          {/* Auto-refresh */}
          <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoRefresh}
                  onChange={e => setAutoRefresh(e.target.checked)}
                  className="rounded"
                />
                Auto-refresh
              </label>
              {autoRefresh && (
                <select
                  value={refreshInterval}
                  onChange={e => setRefreshInterval(parseInt(e.target.value))}
                  className="text-xs border border-slate-200 rounded px-2 py-0.5"
                >
                  <option value="5">5s</option>
                  <option value="10">10s</option>
                  <option value="30">30s</option>
                  <option value="60">1min</option>
                </select>
              )}
            </div>
            {lastUpdated && (
              <div>
                Dernière màj: {lastUpdated.toLocaleTimeString('fr-FR')}
              </div>
            )}
          </div>
        </div>

        {/* Error display */}
        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
            <AlertOctagon className="inline w-4 h-4 me-1" /> {error}
          </div>
        )}

        {/* Logs list */}
        <div className="space-y-2">
          {loading && totalCount === 0 ? (
            <div className="text-center py-12 text-slate-500">
              <RefreshCw className="inline w-6 h-6 animate-spin me-2" />
              Chargement...
            </div>
          ) : totalCount === 0 ? (
            <div className="text-center py-12 bg-white rounded-2xl border border-slate-200">
              <CheckCircle className="inline w-12 h-12 text-emerald-500 mb-3" />
              <p className="text-slate-700 font-semibold">Aucune erreur</p>
              <p className="text-sm text-slate-500 mt-1">Tout va bien sur la période sélectionnée</p>
            </div>
          ) : (
            <>
              {/* ErrorLog items */}
              {source !== 'vercellog' && filteredErrorlog.map(log => (
                <ErrorLogCard
                  key={log.id}
                  log={log}
                  expanded={expandedId === log.id}
                  onToggle={() => setExpandedId(expandedId === log.id ? null : log.id)}
                  onResolve={() => markResolved(log.id)}
                />
              ))}
              {/* VercelLog items */}
              {source !== 'errorlog' && filteredVercelLog.map(log => (
                <VercelLogCard
                  key={log.id}
                  log={log}
                  expanded={expandedId === log.id}
                  onToggle={() => setExpandedId(expandedId === log.id ? null : log.id)}
                />
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Sub-components
// ============================================================================

function ErrorLogCard({ log, expanded, onToggle, onResolve }: { log: ErrorLog; expanded: boolean; onToggle: () => void; onResolve: () => void }) {
  const sevColor = getSeverityColor(log.severity);
  const time = new Date(log.createdAt);
  
  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition">
      <button
        onClick={onToggle}
        className="w-full px-4 py-3 flex items-start gap-3 text-left hover:bg-slate-50 transition"
      >
        <div className={`mt-0.5 w-2 h-2 rounded-full ${sevColor.dot} flex-shrink-0`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-xs font-bold uppercase ${sevColor.text}`}>{log.severity}</span>
            <span className="text-xs px-1.5 py-0.5 bg-slate-100 text-slate-700 rounded">{log.source}</span>
            <code className="text-xs text-slate-500">{log.reference}</code>
            {log.resolved && <span className="text-xs text-emerald-600">✓ Résolu</span>}
          </div>
          <p className="text-sm text-slate-900 mt-1 line-clamp-1">{log.message}</p>
          <div className="flex items-center gap-3 mt-1.5 text-xs text-slate-500 flex-wrap">
            {log.url && <span>📍 {log.url}</span>}
            {log.requestId && (
              <code className="text-[10px] text-slate-400">requestId: {log.requestId}</code>
            )}
            <span>🕐 {time.toLocaleString('fr-FR')}</span>
          </div>
        </div>
        {expanded ? <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0 mt-1" /> : <ChevronRight className="w-4 h-4 text-slate-400 flex-shrink-0 mt-1" />}
      </button>
      {expanded && (
        <div className="border-t border-slate-200 bg-slate-50 p-4 space-y-3 text-sm">
          {log.message && (
            <div>
              <div className="text-xs font-semibold text-slate-500 mb-1">Message</div>
              <div className="text-slate-900 whitespace-pre-wrap bg-white p-3 rounded border border-slate-200">{log.message}</div>
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {log.url && <Field label="URL" value={log.url} mono />}
            {log.method && <Field label="Méthode" value={log.method} />}
            {log.region && <Field label="Région" value={log.region} />}
            {log.requestId && <Field label="Request ID" value={log.requestId} mono />}
            {log.userEmail && <Field label="User" value={log.userEmail} />}
            {log.context && <Field label="Context" value={JSON.stringify(log.context, null, 2)} mono />}
          </div>
          <div className="flex items-center gap-2 pt-2">
            <button
              onClick={onResolve}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-emerald-100 text-emerald-700 hover:bg-emerald-200 rounded-lg transition"
            >
              <CheckCircle className="w-3.5 h-3.5" /> Marquer résolu
            </button>
            <a
              href={`/api/admin/logs/${log.id}`}
              target="_blank"
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-lg transition"
            >
              <ExternalLink className="w-3.5 h-3.5" /> JSON brut
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

function VercelLogCard({ log, expanded, onToggle }: { log: VercelLog; expanded: boolean; onToggle: () => void }) {
  const sevColor = getLevelColor(log.level);
  const time = new Date(log.timestamp);
  
  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition">
      <button
        onClick={onToggle}
        className="w-full px-4 py-3 flex items-start gap-3 text-left hover:bg-slate-50 transition"
      >
        <div className={`mt-0.5 w-2 h-2 rounded-full ${sevColor.dot} flex-shrink-0`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-xs font-bold uppercase ${sevColor.text}`}>{log.level}</span>
            {log.responseStatusCode && (
              <span className={`text-xs px-1.5 py-0.5 rounded ${
                log.responseStatusCode >= 500 ? 'bg-red-100 text-red-700' :
                log.responseStatusCode >= 400 ? 'bg-amber-100 text-amber-700' :
                'bg-emerald-100 text-emerald-700'
              }`}>{log.responseStatusCode}</span>
            )}
            {log.environment && <span className="text-xs px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded">{log.environment}</span>}
            {log.reviewed && <span className="text-xs text-emerald-600">✓ Review</span>}
          </div>
          <p className="text-sm text-slate-900 mt-1 line-clamp-1 font-mono">{log.message}</p>
          <div className="flex items-center gap-3 mt-1.5 text-xs text-slate-500 flex-wrap">
            {log.requestPath && <span>📍 {log.requestMethod} {log.requestPath}</span>}
            {log.requestId && <code className="text-[10px] text-slate-400">requestId: {log.requestId}</code>}
            <span>🕐 {time.toLocaleString('fr-FR')}</span>
          </div>
        </div>
        {expanded ? <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0 mt-1" /> : <ChevronRight className="w-4 h-4 text-slate-400 flex-shrink-0 mt-1" />}
      </button>
      {expanded && (
        <div className="border-t border-slate-200 bg-slate-50 p-4 space-y-3 text-sm">
          <div>
            <div className="text-xs font-semibold text-slate-500 mb-1">Message</div>
            <pre className="text-slate-900 whitespace-pre-wrap bg-white p-3 rounded border border-slate-200 text-xs font-mono overflow-x-auto">{log.message}</pre>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {log.requestPath && <Field label="Path" value={log.requestPath} mono />}
            {log.requestMethod && <Field label="Method" value={log.requestMethod} />}
            {log.responseStatusCode && <Field label="Status" value={String(log.responseStatusCode)} />}
            {log.environment && <Field label="Environment" value={log.environment} />}
            {log.deploymentId && <Field label="Deployment" value={log.deploymentId} mono />}
            {log.requestId && <Field label="Request ID" value={log.requestId} mono />}
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="text-xs font-semibold text-slate-500 mb-1">{label}</div>
      <div className={`text-sm text-slate-900 ${mono ? 'font-mono text-xs' : ''} break-all`}>{value}</div>
    </div>
  );
}

// ============================================================================
// Helpers
// ============================================================================

function getSeverityColor(severity: string) {
  switch (severity) {
    case 'CRITICAL': return { dot: 'bg-red-600', text: 'text-red-700' };
    case 'ERROR': return { dot: 'bg-red-500', text: 'text-red-600' };
    case 'WARNING': return { dot: 'bg-amber-500', text: 'text-amber-600' };
    case 'INFO': return { dot: 'bg-blue-500', text: 'text-blue-600' };
    case 'DEBUG': return { dot: 'bg-slate-400', text: 'text-slate-500' };
    default: return { dot: 'bg-slate-400', text: 'text-slate-500' };
  }
}

function getLevelColor(level: string) {
  switch (level) {
    case 'error': return { dot: 'bg-red-500', text: 'text-red-600' };
    case 'warning': return { dot: 'bg-amber-500', text: 'text-amber-600' };
    case 'info': return { dot: 'bg-blue-500', text: 'text-blue-600' };
    default: return { dot: 'bg-slate-400', text: 'text-slate-500' };
  }
}

// ============================================================================
// API fetchers
// ============================================================================

async function fetchErrorlog(period: Period, severity: Severity): Promise<{ logs: ErrorLog[]; counts: { level: string; count: number }[] }> {
  const params = new URLSearchParams();
  params.set('limit', '100');
  // The /api/admin/logs endpoint queries VercelLog, not ErrorLog
  // We need a separate endpoint for ErrorLog or use Prisma directly
  const res = await fetch(`/api/admin/logs/errorlog?sinceMs=${PERIOD_MS[period]}&severity=${severity}`);
  if (!res.ok) return { logs: [], counts: [] };
  return res.json();
}

async function fetchVercelLog(period: Period): Promise<{ logs: VercelLog[]; counts: { level: string; count: number }[] }> {
  const since = new Date(Date.now() - PERIOD_MS[period]).toISOString();
  const res = await fetch(`/api/admin/logs?since=${since}&limit=100`);
  if (!res.ok) return { logs: [], counts: [] };
  return res.json();
}
