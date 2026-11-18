'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock, ExternalLink, RefreshCw, XCircle } from 'lucide-react';
import { UPTIMEROBOT_STATUS_URL } from '@/lib/service-status';
import { loadUptime } from './useServiceStatus';

/**
 * Panneau d'état du service : lit la route publique /api/status/uptime
 * (rendu À FROID + API UptimeRobot) et affiche l'état global + le détail
 * des moniteurs Examanet.
 *
 * Les libellés sont reçus en props (traduits côté serveur) pour éviter de
 * dépendre du provider client i18n.
 *
 * 2026-11-18 : le fetch passe par `loadUptime()` (promesse partagée avec le
 * badge du pied de page) au lieu d'un fetch direct — le panneau et le badge
 * étaient montés 2 fois chacun, ce qui doublait les appels à la route.
 */

export type StatusLabels = {
  allOperational: string;
  degraded: string;
  down: string;
  checking: string;
  lastCheck: string;
  services: string;
  up: string;
  downLabel: string;
  history: string;
  historyCta: string;
  refreshNote: string;
  error: string;
  monitorFr: string;
  monitorHealth: string;
  monitorWww: string;
};

type Monitor = {
  url?: string;
  name?: string;
  status?: string;
  state?: string;
  up?: boolean;
  down?: boolean;
  upForSeconds?: number | null;
};

type UptimePayload = {
  ok?: boolean;
  checkedAt?: string;
  checks?: Array<{ name?: string; status?: number; ok?: boolean }>;
  uptimerobot?: {
    monitors?: Monitor[];
    monitorsDown?: string[];
    otherMonitorsDown?: string[];
    apiOk?: boolean;
  };
  warnings?: string[];
};

const POLL_MS = 60_000;

export default function ServiceStatusPanel({
  labels,
  locale,
  monitorLabels,
}: {
  labels: StatusLabels;
  locale: string;
  monitorLabels: Record<string, string>;
}) {
  const [data, setData] = useState<UptimePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const json = (await loadUptime()) as UptimePayload;
        if (!alive) return;
        setData(json);
        setError(false);
      } catch {
        if (!alive) return;
        setError(true);
      } finally {
        if (alive) setLoading(false);
      }
    };
    load();
    const timer = setInterval(load, POLL_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  const monitors = (data?.uptimerobot?.monitors ?? []).filter((m) =>
    /^https?:\/\/(www\.)?examanet\.com(\/|$)/i.test(m.url ?? '')
  );

  const downCount = monitors.filter((m) => m.down).length;
  const globalState: 'up' | 'degraded' | 'down' = !data
    ? 'up'
    : data.ok
      ? 'up'
      : downCount > 0
        ? 'down'
        : 'degraded';

  const stateLabel =
    globalState === 'up'
      ? labels.allOperational
      : globalState === 'down'
        ? labels.down
        : labels.degraded;

  return (
    <div className="space-y-6">
      {/* État global */}
      <div
        className={`rounded-2xl border p-6 flex items-start gap-4 ${
          globalState === 'up'
            ? 'border-emerald-200 bg-emerald-50'
            : globalState === 'down'
              ? 'border-red-200 bg-red-50'
              : 'border-amber-200 bg-amber-50'
        }`}
      >
        <div className="shrink-0 mt-0.5">
          {loading ? (
            <RefreshCw className="w-7 h-7 text-slate-400 animate-spin" />
          ) : globalState === 'up' ? (
            <CheckCircle2 className="w-7 h-7 text-emerald-600" />
          ) : globalState === 'down' ? (
            <XCircle className="w-7 h-7 text-red-600" />
          ) : (
            <AlertTriangle className="w-7 h-7 text-amber-600" />
          )}
        </div>
        <div>
          <p
            className={`text-lg font-semibold ${
              globalState === 'up'
                ? 'text-emerald-800'
                : globalState === 'down'
                  ? 'text-red-800'
                  : 'text-amber-800'
            }`}
          >
            {loading ? labels.checking : stateLabel}
          </p>
          {data?.checkedAt ? (
            <p className="text-sm text-slate-600 mt-1 flex items-center gap-1.5">
              <Clock className="w-4 h-4" />
              {labels.lastCheck} :{' '}
              {new Date(data.checkedAt).toLocaleString(locale, {
                dateStyle: 'short',
                timeStyle: 'medium',
              })}
            </p>
          ) : null}
        </div>
      </div>

      {error ? (
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl p-4">
          {labels.error}
        </p>
      ) : null}

      {/* Détail des moniteurs */}
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200 bg-slate-50">
          <h3 className="font-semibold text-slate-800 text-sm uppercase tracking-wide">
            {labels.services}
          </h3>
        </div>
        <ul className="divide-y divide-slate-100">
          {monitors.length === 0 ? (
            <li className="px-5 py-4 text-sm text-slate-500">{labels.checking}</li>
          ) : (
            monitors.map((m) => {
              const key = monitorLabels[m.url ?? ''] ?? '';
              const label = key ? (labels as unknown as Record<string, string>)[key] : m.name;
              const isUp = m.up === true || m.state === 'up';
              return (
                <li key={m.url} className="px-5 py-4 flex items-center justify-between gap-4">
                  <span className="text-sm text-slate-700">{label || m.name}</span>
                  <span
                    className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${
                      isUp
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-red-100 text-red-800'
                    }`}
                  >
                    {isUp ? (
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    ) : (
                      <XCircle className="w-3.5 h-3.5" />
                    )}
                    {isUp ? labels.up : labels.downLabel}
                  </span>
                </li>
              );
            })
          )}
        </ul>
        <p className="px-5 py-3 text-xs text-slate-500 border-t border-slate-100 bg-slate-50">
          {labels.refreshNote}
        </p>
      </div>

      {/* Lien vers la page de statut UptimeRobot (historique + incidents) */}
      <a
        href={UPTIMEROBOT_STATUS_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white px-5 py-4 hover:border-primary-300 hover:bg-slate-50 transition"
      >
        <span>
          <span className="block text-sm font-semibold text-slate-800">{labels.history}</span>
          <span className="block text-xs text-slate-500 mt-0.5">{labels.historyCta}</span>
        </span>
        <ExternalLink className="w-5 h-5 text-slate-400 shrink-0" />
      </a>
    </div>
  );
}
