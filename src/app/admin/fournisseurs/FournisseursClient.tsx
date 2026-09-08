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
  HardDrive,
  Globe,
  Cpu,
  CheckCircle2,
  Box,
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
  usage?: any;
};

export default function FournisseursClient() {
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [cloudflare, setCloudflare] = useState<ExternalInfo | null>(null);
  const [d1, setD1] = useState<ExternalInfo | null>(null);
  const [r2, setR2] = useState<ExternalInfo | null>(null);
  const [liveQuota, setLiveQuota] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [
        provRes,
        cloudflareRes,
        d1Res,
        r2Res,
        apiconvertRes,
        iloveapiRes,
      ] = await Promise.all([
        fetch('/api/admin/providers'),
        fetch('/api/admin/external-services?type=cloudflare'),
        fetch('/api/admin/external-services?type=d1'),
        fetch('/api/admin/external-services?type=r2'),
        fetch('/api/admin/external-services?type=apiconvert'),
        fetch('/api/admin/external-services?type=iloveapi'),
      ]);
      const provData = await provRes.json();
      setProviders(provData.providers || []);
      if (cloudflareRes.ok) setCloudflare(await cloudflareRes.json());
      if (d1Res.ok) setD1(await d1Res.json());
      if (r2Res.ok) setR2(await r2Res.json());
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

  const refresh = async (
    type:
      | 'providers'
      | 'cloudflare'
      | 'd1'
      | 'r2'
      | 'apiconvert'
      | 'iloveapi',
  ) => {
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
          if (type === 'cloudflare') setCloudflare(d);
          else if (type === 'd1') setD1(d);
          else if (type === 'r2') setR2(d);
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

      {/* ==== Section: Cloudflare + D1 + R2 (current infra) ==== */}
      <section>
        <h2 className="text-xl font-extrabold text-slate-800 mb-3 flex items-center gap-2">
          <Cloud className="w-5 h-5 text-orange-500" />
          Infrastructure Cloudflare
          <span className="ml-2 text-xs font-normal px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
            Source de vérité
          </span>
        </h2>
        <div className="grid md:grid-cols-2 gap-4">
          <CloudflareCard
            info={cloudflare}
            refreshing={refreshing === 'cloudflare'}
            onRefresh={() => refresh('cloudflare')}
          />
          <D1Card
            info={d1}
            refreshing={refreshing === 'd1'}
            onRefresh={() => refresh('d1')}
          />
          <R2Card
            info={r2}
            refreshing={refreshing === 'r2'}
            onRefresh={() => refresh('r2')}
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
// ============================================================================
// CloudflareCard (Workers — primary infrastructure)
// ============================================================================

type CFUsage = {
  source: string;
  requests?: number;
  errors?: number;
  successRate?: number;
  cpuTimeP50?: number;
  cpuTimeP99?: number;
  periodStart?: string;
  periodEnd?: string;
  error?: string;
};

type D1UsageType = {
  source: string;
  sizeMb?: number;
  rowsRead?: number;
  rowsWritten?: number;
  queries?: number;
  storage?: { usedMb: number; unit: string };
  periodStart?: string;
  periodEnd?: string;
  error?: string;
};

type R2UsageType = {
  source: string;
  bucketName?: string;
  objectsCount?: number;
  storage?: { usedGb: number; unit: string };
  classAOps?: number;
  classBOps?: number;
  periodStart?: string;
  periodEnd?: string;
  error?: string;
};

function CloudflareCard({
  info,
  refreshing,
  onRefresh,
}: {
  info: ExternalInfo | null;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const u = info?.usage as CFUsage | undefined;
  const configured = info?.configured;
  const hasError = !!u?.error || info?.error;

  return (
    <div className="bg-white rounded-2xl border-2 border-orange-200 p-5 shadow-sm">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="font-extrabold text-slate-900 flex items-center gap-2">
            <Globe className="w-5 h-5 text-orange-500" />
            Cloudflare Workers
            {configured && (
              <span
                className={`text-xs px-2 py-0.5 rounded-full inline-flex items-center gap-1 ${
                  hasError ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'
                }`}
              >
                {hasError ? (
                  <>
                    <AlertCircle className="w-3 h-3" /> Erreur
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-3 h-3" /> Actif
                  </>
                )}
              </span>
            )}
          </h3>
          <p className="text-xs text-slate-500 mt-1">
            Hébergement principal (DNS swap 2026-09-06). Auto-configuré via CF_API_TOKEN.
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

      {!configured ? (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
          ⚠️ CF_API_TOKEN non configuré. Ajouter via <code>wrangler secret put CF_API_TOKEN</code>.
        </div>
      ) : hasError ? (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-800 space-y-2">
          {(u?.error || info?.error || '').includes('403') ||
          (u?.error || info?.error || '').includes('Authentication') ? (
            <>
              <div className="font-bold">🔐 Token sans scope analytics</div>
              <p>
                Le token <code>CF_API_TOKEN</code> fonctionne mais n'a pas la permission{' '}
                <code>Account Analytics: Read</code>.
              </p>
              <a
                href="https://dash.cloudflare.com/profile/api-tokens"
                target="_blank"
                rel="noopener"
                className="inline-flex items-center gap-1 text-blue-700 hover:underline font-semibold"
              >
                Créer un nouveau token avec les scopes Analytics: Read, D1: Read, R2: Read →
              </a>
            </>
          ) : (
            <>Erreur: {u?.error || info?.error}</>
          )}
        </div>
      ) : u ? (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <UsageBar
              icon={<Activity className="w-4 h-4 text-orange-500" />}
              label="Requêtes (7j)"
              value={formatNumber(u.requests || 0)}
            />
            <UsageBar
              icon={<AlertCircle className="w-4 h-4 text-red-500" />}
              label="Erreurs"
              value={formatNumber(u.errors || 0)}
            />
            <UsageBar
              icon={<CheckCircle2 className="w-4 h-4 text-emerald-500" />}
              label="Taux de succès"
              value={`${u.successRate || 100}%`}
            />
            <UsageBar
              icon={<Cpu className="w-4 h-4 text-sky-500" />}
              label="CPU p50 / p99"
              value={`${u.cpuTimeP50 || 0}ms / ${u.cpuTimeP99 || 0}ms`}
            />
          </div>
          {u.periodStart && (
            <p className="text-xs text-slate-400 mt-2">
              Période : {new Date(u.periodStart).toLocaleDateString('fr-FR')} →{' '}
              {new Date(u.periodEnd || Date.now()).toLocaleDateString('fr-FR')}
            </p>
          )}
        </div>
      ) : (
        <p className="text-sm text-slate-500">Chargement...</p>
      )}
    </div>
  );
}

function D1Card({
  info,
  refreshing,
  onRefresh,
}: {
  info: ExternalInfo | null;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const u = info?.usage as D1UsageType | undefined;
  const configured = info?.configured;
  const hasError = !!u?.error || info?.error;

  return (
    <div className="bg-white rounded-2xl border-2 border-blue-200 p-5 shadow-sm">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="font-extrabold text-slate-900 flex items-center gap-2">
            <Database className="w-5 h-5 text-blue-500" />
            Cloudflare D1
            {configured && (
              <span
                className={`text-xs px-2 py-0.5 rounded-full inline-flex items-center gap-1 ${
                  hasError ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'
                }`}
              >
                {hasError ? (
                  <>
                    <AlertCircle className="w-3 h-3" /> Erreur
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-3 h-3" /> Actif
                  </>
                )}
              </span>
            )}
          </h3>
          <p className="text-xs text-slate-500 mt-1">
            Base de données SQLite. Source de vérité. Auto-configuré.
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

      {!configured ? (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
          ⚠️ CF_API_TOKEN non configuré.
        </div>
      ) : hasError ? (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-800 space-y-2">
          {(u?.error || info?.error || '').includes('403') ||
          (u?.error || info?.error || '').includes('Authentication') ? (
            <>
              <div className="font-bold">🔐 Token sans scope analytics</div>
              <p>Le token CF_API_TOKEN n'a pas la permission Account Analytics: Read.</p>
            </>
          ) : (
            <>Erreur: {u?.error || info?.error}</>
          )}
        </div>
      ) : u ? (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <UsageBar
              icon={<Database className="w-4 h-4 text-blue-500" />}
              label="Stockage"
              value={`${u.storage?.usedMb || 0} ${u.storage?.unit || 'MB'}`}
            />
            <UsageBar
              icon={<TrendingUp className="w-4 h-4 text-emerald-500" />}
              label="Requêtes (7j)"
              value={formatNumber(u.queries || 0)}
            />
            <UsageBar
              icon={<Eye className="w-4 h-4 text-sky-500" />}
              label="Rows read"
              value={formatNumber(u.rowsRead || 0)}
            />
            <UsageBar
              icon={<Save className="w-4 h-4 text-amber-500" />}
              label="Rows written"
              value={formatNumber(u.rowsWritten || 0)}
            />
          </div>
          {u.periodStart && (
            <p className="text-xs text-slate-400 mt-2">
              Période : {new Date(u.periodStart).toLocaleDateString('fr-FR')} →{' '}
              {new Date(u.periodEnd || Date.now()).toLocaleDateString('fr-FR')}
            </p>
          )}
        </div>
      ) : (
        <p className="text-sm text-slate-500">Chargement...</p>
      )}
    </div>
  );
}

function R2Card({
  info,
  refreshing,
  onRefresh,
}: {
  info: ExternalInfo | null;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const u = info?.usage as R2UsageType | undefined;
  const configured = info?.configured;
  const hasError = !!u?.error || info?.error;

  return (
    <div className="bg-white rounded-2xl border-2 border-purple-200 p-5 shadow-sm md:col-span-2">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="font-extrabold text-slate-900 flex items-center gap-2">
            <Box className="w-5 h-5 text-purple-500" />
            Cloudflare R2
            {configured && (
              <span
                className={`text-xs px-2 py-0.5 rounded-full inline-flex items-center gap-1 ${
                  hasError ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'
                }`}
              >
                {hasError ? (
                  <>
                    <AlertCircle className="w-3 h-3" /> Erreur
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-3 h-3" /> Actif
                  </>
                )}
              </span>
            )}
          </h3>
          <p className="text-xs text-slate-500 mt-1">
            Stockage objet (PDFs, thumbnails). Bucket:{' '}
            <code className="text-[10px]">examanet-pdf-prod</code>
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

      {!configured ? (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
          ⚠️ CF_API_TOKEN non configuré.
        </div>
      ) : hasError ? (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-800 space-y-2">
          {(u?.error || info?.error || '').includes('403') ||
          (u?.error || info?.error || '').includes('Authentication') ? (
            <>
              <div className="font-bold">🔐 Token sans scope analytics</div>
              <p>Le token CF_API_TOKEN n'a pas la permission Account Analytics: Read.</p>
            </>
          ) : (
            <>Erreur: {u?.error || info?.error}</>
          )}
        </div>
      ) : u ? (
        <div className="space-y-2">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <UsageBar
              icon={<HardDrive className="w-4 h-4 text-purple-500" />}
              label="Stockage"
              value={`${u.storage?.usedGb || 0} ${u.storage?.unit || 'GB'}`}
            />
            <UsageBar
              icon={<Box className="w-4 h-4 text-sky-500" />}
              label="Objets"
              value={formatNumber(u.objectsCount || 0)}
            />
            <UsageBar
              icon={<Zap className="w-4 h-4 text-amber-500" />}
              label="Class A (7j)"
              value={formatNumber(u.classAOps || 0)}
            />
            <UsageBar
              icon={<Zap className="w-4 h-4 text-emerald-500" />}
              label="Class B (7j)"
              value={formatNumber(u.classBOps || 0)}
            />
          </div>
          {u.periodStart && (
            <p className="text-xs text-slate-400 mt-2">
              Période : {new Date(u.periodStart).toLocaleDateString('fr-FR')} →{' '}
              {new Date(u.periodEnd || Date.now()).toLocaleDateString('fr-FR')}
            </p>
          )}
        </div>
      ) : (
        <p className="text-sm text-slate-500">Chargement...</p>
      )}
    </div>
  );
}
