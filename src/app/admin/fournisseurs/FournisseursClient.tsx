'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Key,
  Save,
  Trash2,
  Eye,
  EyeOff,
  RefreshCw,
  AlertCircle,
  Database,
  Cloud,
  Zap,
  Server,
  Activity,
  Loader2,
  ExternalLink,
  TrendingUp,
} from 'lucide-react';
import toast from 'react-hot-toast';

type ProviderInfo = {
  id: string;
  provider: string;
  displayName: string | null;
  publicKey: string | null;
  secretKeyRedacted: string;
  hasSecret: boolean;
  enabled: boolean;
  monthlyQuota: number | null;
  apiUrl: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  usage: {
    month: number;
    year: number;
    used: number;
    success: number;
    failed: number;
    totalBytes: number;
    last30Days: number;
    remaining: number | null;
    percentUsed: number | null;
  };
  lastUse: { at: string; success: boolean; fileName: string } | null;
};

type VercelUsage = {
  periodStart: string;
  periodEnd: string;
  bandwidth: { used: number; unit: string };
  functions: { used: number; unit: string };
  builds: { used: number; unit: string };
  username?: string;
  plan?: string;
  error?: string;
};

type NeonUsage = {
  periodStart: string;
  periodEnd: string;
  storage: { usedMb: number };
  compute: { usedHours: number };
  transfer: { usedGb: number };
  projects: { active: number };
  branches?: { active: number };
  email?: string;
  plan?: string;
  error?: string;
};

type ExternalInfo = {
  configured: boolean;
  enabled?: boolean;
  displayName?: string | null;
  publicKey?: string | null;
  tokenRedacted?: string;
  tokenInvalid?: boolean;
  monthlyQuota?: number | null;
  notes?: string | null;
  updatedAt?: string;
  usage?: VercelUsage | NeonUsage;
};

export default function FournisseursClient() {
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [vercel, setVercel] = useState<ExternalInfo | null>(null);
  const [neon, setNeon] = useState<ExternalInfo | null>(null);
  const [liveQuota, setLiveQuota] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [provRes, vercelRes, neonRes, apiconvertRes, iloveapiRes] = await Promise.all([
        fetch('/api/admin/providers'),
        fetch('/api/admin/external-services?type=vercel'),
        fetch('/api/admin/external-services?type=neon'),
        fetch('/api/admin/external-services?type=apiconvert'),
        fetch('/api/admin/external-services?type=iloveapi'),
      ]);
      const provData = await provRes.json();
      setProviders(provData.providers || []);
      if (vercelRes.ok) setVercel(await vercelRes.json());
      if (neonRes.ok) setNeon(await neonRes.json());
      // Live quota for conversion providers (overrides the monthlyQuota in DB if available)
      const newLiveQuota: Record<string, any> = {};
      if (apiconvertRes.ok) newLiveQuota.apiconvert = await apiconvertRes.json();
      if (iloveapiRes.ok) newLiveQuota.iloveapi = await iloveapiRes.json();
      setLiveQuota(newLiveQuota);
    } catch (e) {
      toast.error('Erreur de chargement');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const refresh = async (type: 'providers' | 'vercel' | 'neon' | 'apiconvert' | 'iloveapi') => {
    setRefreshing(type);
    try {
      if (type === 'providers') {
        const r = await fetch('/api/admin/providers');
        const d = await r.json();
        setProviders(d.providers || []);
      } else {
        const r = await fetch(`/api/admin/external-services?type=${type}`);
        if (r.ok) {
          const d = await r.json();
          if (type === 'vercel') setVercel(d);
          else if (type === 'neon') setNeon(d);
          else setLiveQuota((prev) => ({ ...prev, [type]: d }));
        }
      }
    } finally {
      setRefreshing(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 flex items-center gap-3">
            <Key className="w-7 h-7 text-primary-600" />
            Fournisseurs & abonnements
          </h1>
          <p className="text-slate-500 mt-1">
            Gérez vos clés API et suivez la consommation de chaque service
          </p>
        </div>
        <button onClick={() => load()} className="btn-secondary flex items-center gap-2">
          <RefreshCw className="w-4 h-4" />
          Tout rafraîchir
        </button>
      </div>

      {/* ==== Section: Conversion providers (iLoveAPI, APIConvert) ==== */}
      <section>
        <h2 className="text-xl font-extrabold text-slate-800 mb-3 flex items-center gap-2">
          <Zap className="w-5 h-5 text-amber-500" />
          Conversion PDF (Office → PDF)
        </h2>
        <div className="grid md:grid-cols-2 gap-4">
          <ProviderCard
            provider="iloveapi"
            info={providers.find((p) => p.provider === 'iloveapi')}
            liveQuota={liveQuota.iloveapi}
            title="iLoveAPI"
            description="Plan A. Service payant. Qualité haute (LibreOffice). Quota vérifié en direct via /v1/info (remaining_credits)."
            docsUrl="https://www.iloveapi.com/docs/api-reference"
            onChanged={() => {
              refresh('providers');
              refresh('iloveapi');
            }}
            refreshing={refreshing === 'providers' || refreshing === 'iloveapi'}
            extraFields={[
              {
                name: 'publicKey',
                label: 'Public Key',
                required: true,
                placeholder: 'project_public_xxxx',
              },
              {
                name: 'secretKey',
                label: 'Secret Key',
                required: true,
                placeholder: 'secret_key_xxxx',
                secret: true,
              },
            ]}
          />
          <ProviderCard
            provider="apiconvert"
            info={providers.find((p) => p.provider === 'apiconvert')}
            liveQuota={liveQuota.apiconvert}
            title="APIConvert"
            description="Plan B. Free tier 1500 conversions/mois. Quota vérifié en direct via GET /v2/user."
            docsUrl="https://docs.convertapi.com/"
            onChanged={() => {
              refresh('providers');
              refresh('apiconvert');
            }}
            refreshing={refreshing === 'providers' || refreshing === 'apiconvert'}
            extraFields={[
              {
                name: 'apiUrl',
                label: 'API URL (optionnel)',
                required: false,
                placeholder: 'https://v2.convertapi.com',
              },
              {
                name: 'secretKey',
                label: 'API Token',
                required: true,
                placeholder: 'token_xxxx',
                secret: true,
              },
            ]}
          />
        </div>
      </section>

      {/* ==== Section: Vercel & Neon usage ==== */}
      <section>
        <h2 className="text-xl font-extrabold text-slate-800 mb-3 flex items-center gap-2">
          <Cloud className="w-5 h-5 text-sky-500" />
          Infrastructure
        </h2>
        <div className="grid md:grid-cols-2 gap-4">
          <VercelCard
            info={vercel}
            refreshing={refreshing === 'vercel'}
            onRefresh={() => refresh('vercel')}
            onChanged={() => refresh('vercel')}
          />
          <NeonCard
            info={neon}
            refreshing={refreshing === 'neon'}
            onRefresh={() => refresh('neon')}
            onChanged={() => refresh('neon')}
          />
        </div>
      </section>

      {/* ==== Section: All recent activity ==== */}
      <section>
        <h2 className="text-xl font-extrabold text-slate-800 mb-3 flex items-center gap-2">
          <Activity className="w-5 h-5 text-emerald-500" />
          Activité récente (30 derniers jours)
        </h2>
        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          {providers.length === 0 ? (
            <p className="text-slate-500 text-sm text-center py-6">
              Aucun provider configuré. Ajoutez iLoveAPI ou APIConvert ci-dessus.
            </p>
          ) : (
            <div className="space-y-2">
              {providers.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between p-3 bg-slate-50 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-2 h-2 rounded-full ${p.enabled ? 'bg-emerald-500' : 'bg-slate-300'}`}
                    />
                    <span className="font-bold text-slate-800 capitalize">{p.provider}</span>
                    {p.lastUse && (
                      <span className="text-xs text-slate-500">
                        Dernier: {new Date(p.lastUse.at).toLocaleString('fr-FR')}
                        {p.lastUse.success ? ' ✓' : ' ✗'}
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-slate-600">
                    <span className="font-bold text-slate-900">{p.usage.last30Days}</span>{' '}
                    conversions / 30j
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

// ============================================================================
// ProviderCard (iLoveAPI / APIConvert)
// ============================================================================

function ProviderCard({
  provider,
  info,
  liveQuota,
  title,
  description,
  docsUrl,
  onChanged,
  refreshing,
  extraFields,
}: {
  provider: string;
  info?: ProviderInfo;
  liveQuota?: any;
  title: string;
  description: string;
  docsUrl: string;
  onChanged: () => void;
  refreshing: boolean;
  extraFields: {
    name: string;
    label: string;
    required: boolean;
    placeholder: string;
    secret?: boolean;
  }[];
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [enabled, setEnabled] = useState(true);
  const [monthlyQuota, setMonthlyQuota] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (info) {
      setForm({
        publicKey: info.publicKey || '',
        secretKey: '',
        apiUrl: info.apiUrl || '',
      });
      setEnabled(info.enabled);
      setMonthlyQuota(info.monthlyQuota?.toString() || '');
      setNotes(info.notes || '');
    }
  }, [info]);

  async function save() {
    setSaving(true);
    try {
      const body: any = {
        provider,
        enabled,
        monthlyQuota: monthlyQuota ? parseInt(monthlyQuota, 10) : null,
        notes: notes || null,
      };
      // Only send the fields that have values
      for (const f of extraFields) {
        if (form[f.name] && form[f.name]!.trim()) {
          body[f.name] = form[f.name]!.trim();
        }
      }
      if (!body.secretKey) {
        toast.error('Le token / secret key est requis');
        setSaving(false);
        return;
      }
      const r = await fetch('/api/admin/providers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (!r.ok) {
        toast.error(d.error || 'Erreur');
        return;
      }
      toast.success('Clé enregistrée');
      setEditing(false);
      onChanged();
    } catch (e) {
      toast.error('Erreur réseau');
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!confirm(`Supprimer la configuration de ${title} ?`)) return;
    try {
      const r = await fetch(`/api/admin/providers?provider=${provider}`, {
        method: 'DELETE',
      });
      if (!r.ok) {
        const d = await r.json();
        toast.error(d.error || 'Erreur');
        return;
      }
      toast.success('Supprimé');
      onChanged();
    } catch {
      toast.error('Erreur');
    }
  }

  const configured = !!info;
  const usage = info?.usage;
  // Use live quota from the external service if available, otherwise fall back to DB
  const liveQ = liveQuota?.quota;
  const totalQuota = liveQ?.total || info?.monthlyQuota || 0;
  const liveRemaining = liveQ?.remaining;
  const liveUsed = liveQ?.used;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="font-extrabold text-slate-900 flex items-center gap-2">
            {title}
            {configured && (
              <span
                className={`text-xs px-2 py-0.5 rounded-full ${enabled ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}
              >
                {enabled ? 'Actif' : 'Désactivé'}
              </span>
            )}
          </h3>
          <p className="text-xs text-slate-500 mt-1">{description}</p>
        </div>
        <a
          href={docsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-slate-400 hover:text-slate-700"
        >
          <ExternalLink className="w-4 h-4" />
        </a>
      </div>

      {/* Status / Quota display */}
      {configured && (usage || liveQ) && (
        <div className="mb-3 p-3 bg-gradient-to-br from-slate-50 to-white rounded-lg border border-slate-200">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-bold text-slate-500 uppercase">
              {liveQ
                ? 'Used credits this month'
                : new Date(usage!.year, usage!.month - 1, 1).toLocaleString('fr-FR', {
                    month: 'long',
                    year: 'numeric',
                  })}
            </span>
            <span className="text-xs text-slate-500 font-mono">
              {liveQ
                ? `${formatNumber(liveUsed ?? 0)} / ${formatNumber(totalQuota || 0)} used`
                : `${formatNumber(usage!.used)} / ${formatNumber(info!.monthlyQuota || 0)} used`}
            </span>
          </div>
          {totalQuota > 0 && (
            <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all ${
                  (liveQ?.percent ?? usage?.percentUsed ?? 0) > 80
                    ? 'bg-red-500'
                    : (liveQ?.percent ?? usage?.percentUsed ?? 0) > 50
                      ? 'bg-amber-500'
                      : 'bg-emerald-500'
                }`}
                style={{ width: `${Math.min(100, liveQ?.percent ?? usage?.percentUsed ?? 0)}%` }}
              />
            </div>
          )}
          <div className="flex items-center justify-between mt-2 text-xs">
            {liveQ ? (
              <>
                <span className="text-emerald-600 font-bold">
                  ✓ {formatNumber(liveRemaining ?? 0)} restantes
                </span>
                {liveQ.source && <span className="text-slate-400">via {liveQ.source}</span>}
              </>
            ) : (
              <>
                <span className="text-emerald-600 font-bold">
                  ✓ {formatNumber(usage!.success)} OK
                </span>
                {usage!.failed > 0 && (
                  <span className="text-red-600 font-bold">✗ {formatNumber(usage!.failed)}</span>
                )}
                {info!.monthlyQuota && usage!.remaining != null && (
                  <span className="text-slate-500">{formatNumber(usage!.remaining)} restantes</span>
                )}
              </>
            )}
          </div>
          {liveQ?.error && (
            <div className="mt-2 text-xs text-amber-700 bg-amber-50 rounded p-2">
              ⚠ {liveQ.error}
            </div>
          )}
        </div>
      )}

      {configured && !editing && (
        <div className="space-y-2 text-sm">
          <div className="flex items-center justify-between p-2 bg-slate-50 rounded">
            <span className="text-slate-500 text-xs">Token / Secret</span>
            <code className="text-xs text-slate-700 font-mono">
              {showSecret ? info?.secretKeyRedacted : '••••••••••••'}
            </code>
            <button
              onClick={() => setShowSecret(!showSecret)}
              className="text-slate-400 hover:text-slate-700"
            >
              {showSecret ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            </button>
          </div>
          {info?.publicKey && (
            <div className="flex items-center justify-between p-2 bg-slate-50 rounded">
              <span className="text-slate-500 text-xs">Public Key</span>
              <code className="text-xs text-slate-700 font-mono truncate max-w-[200px]">
                {info.publicKey}
              </code>
            </div>
          )}
          {info?.lastUse && (
            <div className="text-xs text-slate-500 p-2">
              Dernier usage: <strong>{new Date(info.lastUse.at).toLocaleString('fr-FR')}</strong>
              {' — '}
              <span className={info.lastUse.success ? 'text-emerald-600' : 'text-red-600'}>
                {info.lastUse.success ? '✓ succès' : '✗ échec'}
              </span>
            </div>
          )}
          <div className="flex gap-2 pt-2">
            <button
              onClick={() => setEditing(true)}
              className="btn-secondary flex items-center gap-1.5 text-sm"
            >
              <Key className="w-3.5 h-3.5" />
              Modifier
            </button>
            <button
              onClick={remove}
              className="btn-secondary text-red-600 hover:bg-red-50 flex items-center gap-1.5 text-sm"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Supprimer
            </button>
          </div>
        </div>
      )}

      {(!configured || editing) && (
        <div className="space-y-3 mt-2">
          {extraFields.map((f) => (
            <div key={f.name}>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                {f.label} {f.required && <span className="text-red-500">*</span>}
              </label>
              <input
                type={f.secret ? 'password' : 'text'}
                value={form[f.name] || ''}
                onChange={(e) => setForm({ ...form, [f.name]: e.target.value })}
                placeholder={f.placeholder}
                className="input text-sm"
              />
            </div>
          ))}
          <div>
            <label htmlFor="quota" className="block text-xs font-bold text-slate-700 mb-1">
              Quota mensuel (optionnel)
            </label>
            <input id="quota" type="number"
              value={monthlyQuota}
              onChange={(e) => setMonthlyQuota(e.target.value)}
              placeholder="ex: 250 pour iLoveAPI gratuit"
              className="input text-sm"
            />
          </div>
          <div>
            <label htmlFor="notes" className="block text-xs font-bold text-slate-700 mb-1">Notes</label>
            <input id="notes" type="text" value={notes} onChange={(e) => setNotes(e.target.value)}
              placeholder="ex: compte pro Mehdi"
              className="input text-sm"
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id={`${provider}-enabled`}
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="rounded"
            />
            <label htmlFor={`${provider}-enabled`} className="text-sm text-slate-700">
              Activé
            </label>
          </div>
          <div className="flex gap-2">
            <button
              onClick={save}
              disabled={saving}
              className="btn-primary flex items-center gap-1.5 text-sm"
            >
              {saving ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Save className="w-3.5 h-3.5" />
              )}
              Enregistrer
            </button>
            {configured && (
              <button onClick={() => setEditing(false)} className="btn-secondary text-sm">
                Annuler
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// VercelCard
// ============================================================================

function VercelCard({
  info,
  refreshing,
  onRefresh,
  onChanged,
}: {
  info: ExternalInfo | null;
  refreshing: boolean;
  onRefresh: () => void;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [token, setToken] = useState('');
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!token || token.trim().length < 8) {
      toast.error('Token requis (min 8 caractères)');
      return;
    }
    setSaving(true);
    try {
      const r = await fetch('/api/admin/external-services', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'vercel', token: token.trim() }),
      });
      const d = await r.json();
      if (!r.ok) {
        toast.error(d.error || 'Erreur');
        return;
      }
      toast.success('Token Vercel enregistré');
      setEditing(false);
      setToken('');
      onChanged();
    } catch {
      toast.error('Erreur');
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!confirm('Supprimer le token Vercel ?')) return;
    const r = await fetch('/api/admin/external-services?type=vercel', { method: 'DELETE' });
    if (!r.ok) {
      toast.error('Erreur');
      return;
    }
    toast.success('Supprimé');
    onChanged();
  }

  const u = info?.usage as VercelUsage | undefined;
  const configured = info?.configured;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="font-extrabold text-slate-900 flex items-center gap-2">
            <Server className="w-5 h-5 text-slate-900" />
            Vercel
            {configured && (
              <span
                className={`text-xs px-2 py-0.5 rounded-full ${info?.enabled ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}
              >
                Connecté
              </span>
            )}
          </h3>
          <p className="text-xs text-slate-500 mt-1">
            Hébergement Next.js. Suivi bandwidth / functions / builds.
          </p>
        </div>
        <div className="flex gap-1">
          {configured && (
            <button
              onClick={onRefresh}
              disabled={refreshing}
              className="p-1.5 hover:bg-slate-100 rounded text-slate-500"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
          )}
        </div>
      </div>

      {configured && u && !u.error && (
        <div className="space-y-2 mb-3">
          {u.username && (
            <div className="text-xs text-slate-500">
              Compte: <strong>{u.username}</strong>{' '}
              {u.plan && <span className="ml-1 text-slate-400">({u.plan})</span>}
            </div>
          )}
          <div className="grid grid-cols-3 gap-2">
            <UsageBar
              icon={<TrendingUp className="w-3 h-3" />}
              label="Bandwidth"
              value={u.bandwidth.used}
              unit={u.bandwidth.unit}
            />
            <UsageBar
              icon={<Zap className="w-3 h-3" />}
              label="Functions"
              value={u.functions.used}
              unit={u.functions.unit}
            />
            <UsageBar
              icon={<Activity className="w-3 h-3" />}
              label="Builds"
              value={u.builds.used}
              unit={u.builds.unit}
            />
          </div>
          <div className="text-xs text-slate-500 text-center pt-1">
            Période: {u.periodStart} → {u.periodEnd}
          </div>
        </div>
      )}

      {u?.error && (
        <div className="mb-3 p-2 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800 flex items-start gap-2">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          {u.error}
        </div>
      )}

      {configured && !editing && (
        <div className="flex gap-2">
          <button
            onClick={() => setEditing(true)}
            className="btn-secondary text-sm flex items-center gap-1.5"
          >
            <Key className="w-3.5 h-3.5" />
            Modifier le token
          </button>
          <button
            onClick={remove}
            className="btn-secondary text-sm text-red-600 hover:bg-red-50 flex items-center gap-1.5"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Supprimer
          </button>
        </div>
      )}

      {(!configured || editing) && (
        <div className="space-y-3 mt-2">
          <div>
            <label htmlFor="vercelToken" className="block text-xs font-bold text-slate-700 mb-1">Vercel API Token</label>
            <input id="vercelToken"
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="vercel_token_xxxxx..."
              className="input text-sm"
            />
            <p className="text-xs text-slate-500 mt-1">
              Créez un token sur{' '}
              <a
                href="https://vercel.com/dashboard/settings/tokens"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary-600 hover:underline"
              >
                vercel.com/dashboard/settings/tokens
              </a>
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={save}
              disabled={saving}
              className="btn-primary text-sm flex items-center gap-1.5"
            >
              {saving ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Save className="w-3.5 h-3.5" />
              )}
              Connecter
            </button>
            {configured && (
              <button onClick={() => setEditing(false)} className="btn-secondary text-sm">
                Annuler
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// NeonCard
// ============================================================================

function NeonCard({
  info,
  refreshing,
  onRefresh,
  onChanged,
}: {
  info: ExternalInfo | null;
  refreshing: boolean;
  onRefresh: () => void;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [token, setToken] = useState('');
  const [projectId, setProjectId] = useState('');
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!token || token.trim().length < 8) {
      toast.error('API key requise');
      return;
    }
    setSaving(true);
    try {
      const r = await fetch('/api/admin/external-services', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'neon',
          token: token.trim(),
          publicKey: projectId.trim() || null,
        }),
      });
      const d = await r.json();
      if (!r.ok) {
        toast.error(d.error || 'Erreur');
        return;
      }
      toast.success('Token Neon enregistré');
      setEditing(false);
      setToken('');
      onChanged();
    } catch {
      toast.error('Erreur');
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!confirm('Supprimer le token Neon ?')) return;
    const r = await fetch('/api/admin/external-services?type=neon', { method: 'DELETE' });
    if (!r.ok) {
      toast.error('Erreur');
      return;
    }
    toast.success('Supprimé');
    onChanged();
  }

  const u = info?.usage as NeonUsage | undefined;
  const configured = info?.configured;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="font-extrabold text-slate-900 flex items-center gap-2">
            <Database className="w-5 h-5 text-emerald-600" />
            Neon
            {configured && (
              <span
                className={`text-xs px-2 py-0.5 rounded-full ${info?.enabled ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}
              >
                Connecté
              </span>
            )}
          </h3>
          <p className="text-xs text-slate-500 mt-1">
            Base PostgreSQL serverless. Suivi storage, compute, projets.
          </p>
        </div>
        <div className="flex gap-1">
          {configured && (
            <button
              onClick={onRefresh}
              disabled={refreshing}
              className="p-1.5 hover:bg-slate-100 rounded text-slate-500"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
          )}
        </div>
      </div>

      {configured && u && !u.error && (
        <div className="space-y-2 mb-3">
          <div className="grid grid-cols-2 gap-2">
            <UsageBar
              icon={<Database className="w-3 h-3" />}
              label="Stockage"
              value={u.storage.usedMb}
              unit="MB"
            />
            <UsageBar
              icon={<Zap className="w-3 h-3" />}
              label="Compute"
              value={u.compute.usedHours}
              unit="heures"
            />
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="p-2 bg-slate-50 rounded">
              <div className="text-slate-500">Projets actifs</div>
              <div className="font-bold text-slate-900">{u.projects.active}</div>
            </div>
            {u.branches && (
              <div className="p-2 bg-slate-50 rounded">
                <div className="text-slate-500">Branches</div>
                <div className="font-bold text-slate-900">{u.branches.active}</div>
              </div>
            )}
          </div>
          <div className="text-xs text-slate-500 text-center pt-1">
            Période: {u.periodStart} → {u.periodEnd}
          </div>
        </div>
      )}

      {u?.error && (
        <div className="mb-3 p-2 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800 flex items-start gap-2">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          {u.error}
        </div>
      )}

      {configured && !editing && (
        <div className="flex gap-2">
          <button
            onClick={() => setEditing(true)}
            className="btn-secondary text-sm flex items-center gap-1.5"
          >
            <Key className="w-3.5 h-3.5" />
            Modifier le token
          </button>
          <button
            onClick={remove}
            className="btn-secondary text-sm text-red-600 hover:bg-red-50 flex items-center gap-1.5"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Supprimer
          </button>
        </div>
      )}

      {(!configured || editing) && (
        <div className="space-y-3 mt-2">
          <div>
            <label htmlFor="neonKey" className="block text-xs font-bold text-slate-700 mb-1">Neon API Key</label>
            <input id="neonKey"
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="neon_xxx..."
              className="input text-sm"
            />
            <p className="text-xs text-slate-500 mt-1">
              Créez une clé sur{' '}
              <a
                href="https://console.neon.tech/app/settings/api-keys"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary-600 hover:underline"
              >
                console.neon.tech → Settings → API Keys
              </a>
            </p>
          </div>
          <div>
            <label htmlFor="projectId" className="block text-xs font-bold text-slate-700 mb-1">
              Project ID (optionnel, défaut = premier projet)
            </label>
            <input id="projectId" type="text" value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              placeholder="ep-xxx-xxx"
              className="input text-sm"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={save}
              disabled={saving}
              className="btn-primary text-sm flex items-center gap-1.5"
            >
              {saving ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Save className="w-3.5 h-3.5" />
              )}
              Connecter
            </button>
            {configured && (
              <button onClick={() => setEditing(false)} className="btn-secondary text-sm">
                Annuler
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Helpers
// ============================================================================

function formatNumber(n: number): string {
  return n.toLocaleString('fr-FR');
}

// ============================================================================
// UsageBar (small metric display)
// ============================================================================

function UsageBar({
  icon,
  label,
  value,
  unit,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  unit: string;
}) {
  return (
    <div className="p-2 bg-slate-50 rounded">
      <div className="flex items-center gap-1 text-slate-500 text-xs mb-0.5">
        {icon}
        <span>{label}</span>
      </div>
      <div className="text-sm font-bold text-slate-900">
        {value.toLocaleString('fr-FR')}{' '}
        <span className="text-xs font-normal text-slate-500">{unit}</span>
      </div>
    </div>
  );
}
