/**
 * ServiceCard — generic card for Cloudflare Workers / D1 / R2.
 *
 * Replaces the 3 nearly-identical components (CloudflareCard, D1Card,
 * R2Card) that were duplicated in FournisseursClient. The differences
 * are now configuration: icon, title, description, color, and the
 * list of metrics to show.
 */

'use client';

import { ReactNode } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  RefreshCw,
} from 'lucide-react';
import { UsageBar } from './UsageBar';
import { formatNumber, isAuthError, formatPeriod } from '@/lib/admin/quota';

export type ExternalInfo = {
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
  error?: string;
};

export type ServiceMetric = {
  icon: ReactNode;
  label: string;
  /** value as string (pre-formatted) OR number (will go through formatNumber) */
  value: string | number;
  /** If false, value is treated as already-formatted text */
  formatAsNumber?: boolean;
};

export function ServiceCard({
  info,
  refreshing,
  onRefresh,
  icon,
  title,
  description,
  borderColor = 'border-slate-200',
  metrics,
  fullWidth = false,
  errorHint,
  notConfiguredHint = '⚠️ CF_API_TOKEN non configuré.',
  scopeLink,
}: {
  info: ExternalInfo | null;
  refreshing: boolean;
  onRefresh: () => void;
  icon: ReactNode;
  title: string;
  description: ReactNode;
  /** Tailwind border class — e.g. "border-orange-200", "border-blue-200" */
  borderColor?: string;
  metrics: (u: any) => ServiceMetric[];
  fullWidth?: boolean;
  errorHint?: ReactNode;
  notConfiguredHint?: string;
  /** Optional link to fix auth scope (rendered when 403/Authentication error) */
  scopeLink?: { href: string; label: string };
}) {
  const u = info?.usage;
  const configured = info?.configured;
  const hasError = !!u?.error || info?.error;
  const authError = isAuthError(u?.error || info?.error);

  return (
    <div
      className={`bg-white rounded-2xl border-2 ${borderColor} p-5 shadow-sm ${
        fullWidth ? 'md:col-span-2' : ''
      }`}
    >
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="font-extrabold text-slate-900 flex items-center gap-2">
            {icon}
            {title}
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
          <p className="text-xs text-slate-500 mt-1">{description}</p>
        </div>
        {configured && (
          <button
            onClick={onRefresh}
            disabled={refreshing}
            className="p-1.5 hover:bg-slate-100 rounded text-slate-500"
            title="Rafraîchir"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        )}
      </div>

      {!configured ? (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
          {notConfiguredHint}
        </div>
      ) : hasError ? (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-800 space-y-2">
          {authError ? (
            <>
              <div className="font-bold">🔐 Token sans scope analytics</div>
              <p>
                Le token <code>CF_API_TOKEN</code> fonctionne mais n'a pas la permission{' '}
                <code>Account Analytics: Read</code>.
              </p>
              {scopeLink && (
                <a
                  href={scopeLink.href}
                  target="_blank"
                  rel="noopener"
                  className="inline-flex items-center gap-1 text-blue-700 hover:underline font-semibold"
                >
                  {scopeLink.label} →
                </a>
              )}
            </>
          ) : (
            errorHint ?? <>Erreur: {u?.error || info?.error}</>
          )}
        </div>
      ) : u ? (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            {metrics(u).map((m, i) => (
              <UsageBar
                key={i}
                icon={m.icon}
                label={m.label}
                value={m.value}
                formatAsNumber={m.formatAsNumber !== false}
              />
            ))}
          </div>
          {u.periodStart && (
            <p className="text-xs text-slate-400 mt-2">
              Période : {formatPeriod(u.periodStart, u.periodEnd)}
            </p>
          )}
        </div>
      ) : (
        <p className="text-sm text-slate-500">Chargement...</p>
      )}
    </div>
  );
}

/* ============================================================================
 * Pre-configured metric sets for the 3 Cloudflare services
 * ============================================================================ */

export const cloudflareMetrics = (u: any): ServiceMetric[] => [
  {
    icon: <AlertCircle className="w-4 h-4 text-orange-500" />,
    label: 'Requêtes (7j)',
    value: u.requests || 0,
  },
  {
    icon: <AlertCircle className="w-4 h-4 text-red-500" />,
    label: 'Erreurs',
    value: u.errors || 0,
  },
  {
    icon: <CheckCircle2 className="w-4 h-4 text-emerald-500" />,
    label: 'Taux de succès',
    value: `${u.successRate || 100}%`,
    formatAsNumber: false,
  },
  {
    icon: <CheckCircle2 className="w-4 h-4 text-sky-500" />,
    label: 'CPU p50 / p99',
    value: `${u.cpuTimeP50 || 0}ms / ${u.cpuTimeP99 || 0}ms`,
    formatAsNumber: false,
  },
];

export const d1Metrics = (u: any): ServiceMetric[] => [
  {
    icon: <CheckCircle2 className="w-4 h-4 text-blue-500" />,
    label: 'Stockage',
    value: `${u.storage?.usedMb || 0} ${u.storage?.unit || 'MB'}`,
    formatAsNumber: false,
  },
  {
    icon: <CheckCircle2 className="w-4 h-4 text-emerald-500" />,
    label: 'Requêtes (7j)',
    value: u.queries || 0,
  },
  {
    icon: <CheckCircle2 className="w-4 h-4 text-sky-500" />,
    label: 'Rows read',
    value: u.rowsRead || 0,
  },
  {
    icon: <CheckCircle2 className="w-4 h-4 text-amber-500" />,
    label: 'Rows written',
    value: u.rowsWritten || 0,
  },
];

export const r2Metrics = (u: any): ServiceMetric[] => [
  {
    icon: <CheckCircle2 className="w-4 h-4 text-purple-500" />,
    label: 'Stockage',
    value: `${u.storage?.usedGb || 0} ${u.storage?.unit || 'GB'}`,
    formatAsNumber: false,
  },
  {
    icon: <CheckCircle2 className="w-4 h-4 text-sky-500" />,
    label: 'Objets',
    value: u.objectsCount || 0,
  },
  {
    icon: <CheckCircle2 className="w-4 h-4 text-amber-500" />,
    label: 'Class A (7j)',
    value: u.classAOps || 0,
  },
  {
    icon: <CheckCircle2 className="w-4 h-4 text-emerald-500" />,
    label: 'Class B (7j)',
    value: u.classBOps || 0,
  },
];
