/**
 * /admin/fournisseurs — top-level data fetching + layout.
 *
 * The 4 sub-components (UsageBar, ProviderCard, ServiceCard) and the
 * utilities (quota.ts) were extracted from a previous 1016-line monolith
 * (2026-09-10 refactor). This file now only handles:
 *   - parallel fetching of providers + external services
 *   - orchestration of refresh/save actions
 *   - section layout
 *
 * Sub-components:
 *   - <ProviderCard />   — iLoveAPI / APIConvert
 *   - <ServiceCard />    — Cloudflare Workers / D1 / R2
 *   - <UsageBar />       — single metric tile (icon + label + value)
 */

'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Key,
  RefreshCw,
  Zap,
  Cloud,
  Activity,
  Globe,
  Database,
  Box,
  Loader2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { ProviderCard, type ProviderInfo, type ProviderField } from '@/components/admin/fournisseurs/ProviderCard';
import {
  ServiceCard,
  cloudflareMetrics,
  d1Metrics,
  r2Metrics,
  type ExternalInfo,
} from '@/components/admin/fournisseurs/ServiceCard';

type LiveQuota = Record<string, { quota?: any }>;

const PROVIDER_FIELDS: Record<string, ProviderField[]> = {
  iloveapi: [
    { name: 'publicKey', label: 'Public Key', required: true, placeholder: 'project_public_xxxx' },
    { name: 'secretKey', label: 'Secret Key', required: true, placeholder: 'secret_key_xxxx', secret: true },
  ],
  apiconvert: [
    { name: 'apiUrl', label: 'API URL (optionnel)', required: false, placeholder: 'https://v2.convertapi.com' },
    { name: 'secretKey', label: 'API Token', required: true, placeholder: 'token_xxxx', secret: true },
  ],
};

export default function FournisseursClient() {
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [cloudflare, setCloudflare] = useState<ExternalInfo | null>(null);
  const [d1, setD1] = useState<ExternalInfo | null>(null);
  const [r2, setR2] = useState<ExternalInfo | null>(null);
  const [liveQuota, setLiveQuota] = useState<LiveQuota>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [provRes, cloudflareRes, d1Res, r2Res, apiconvertRes, iloveapiRes] =
        await Promise.all([
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
      const newLiveQuota: LiveQuota = {};
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
    type: 'providers' | 'cloudflare' | 'd1' | 'r2' | 'apiconvert' | 'iloveapi',
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
            extraFields={PROVIDER_FIELDS.iloveapi}
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
            extraFields={PROVIDER_FIELDS.apiconvert}
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
        <div className="space-y-4">
          <ServiceCard
            info={cloudflare}
            refreshing={refreshing === 'cloudflare'}
            onRefresh={() => refresh('cloudflare')}
            icon={<Globe className="w-5 h-5 text-orange-500" />}
            title="Cloudflare Workers"
            description="Hébergement principal (DNS swap 2026-09-06). Auto-configuré via CF_API_TOKEN."
            borderColor="border-orange-200"
            metrics={cloudflareMetrics}
            notConfiguredHint={
              <>
                ⚠️ CF_API_TOKEN non configuré. Ajouter via{' '}
                <code>wrangler secret put CF_API_TOKEN</code>.
              </>
            }
            scopeLink={{
              href: 'https://dash.cloudflare.com/profile/api-tokens',
              label:
                'Créer un nouveau token avec les scopes Analytics: Read, D1: Read, R2: Read',
            }}
          />
          <div className="grid md:grid-cols-2 gap-4">
            <ServiceCard
              info={d1}
              refreshing={refreshing === 'd1'}
              onRefresh={() => refresh('d1')}
              icon={<Database className="w-5 h-5 text-blue-500" />}
              title="Cloudflare D1"
              description="Base de données SQLite. Source de vérité. Auto-configuré."
              borderColor="border-blue-200"
              metrics={d1Metrics}
            />
            <ServiceCard
              info={r2}
              refreshing={refreshing === 'r2'}
              onRefresh={() => refresh('r2')}
              icon={<Box className="w-5 h-5 text-purple-500" />}
              title="Cloudflare R2"
              description={
                <>
                  Stockage objet (PDFs, thumbnails). Bucket:{' '}
                  <code className="text-[10px]">examanet-pdf-prod</code>
                </>
              }
              borderColor="border-purple-200"
              metrics={r2Metrics}
            />
          </div>
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
                      className={`w-2 h-2 rounded-full ${
                        p.enabled ? 'bg-emerald-500' : 'bg-slate-300'
                      }`}
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
