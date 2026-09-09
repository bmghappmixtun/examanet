'use client';

/**
 * Modern Activity Chart — 7 derniers jours
 *
 * Improvements vs the old inline chart:
 * - KPI cards row with today + delta vs yesterday (color-coded)
 * - Interactive SVG chart with hover tooltips (crosshair guide + tooltip card)
 * - Click legend pills to toggle series visibility
 * - Smooth bezier curves + area gradients (modern look)
 * - Day labels with weekday name + date
 * - Empty state with explanation (24-48h GA Data API lag)
 * - Server-rendered static fallback handled by parent (no hydration mismatch)
 *
 * Why client component: needs useState for hover/legend toggle.
 */

import { useState } from 'react';
import {
  Users,
  FileText,
  Download,
  Eye,
  Activity,
  ArrowUpRight,
  ArrowDownRight,
  Sparkles,
} from 'lucide-react';
import { formatNumber } from '@/lib/utils';

type DayData = {
  ts: number;
  users: number;
  resources: number;
  downloads: number;
  visitors: number;
};

type SeriesKey = 'visitors' | 'users' | 'resources' | 'downloads';

const SERIES_META: Record<
  SeriesKey,
  { label: string; short: string; color: string; gradient: [string, string]; Icon: any }
> = {
  visitors: {
    label: 'Visiteurs uniques',
    short: 'Visiteurs',
    color: '#A855F7',
    gradient: ['#C084FC', '#7C3AED'],
    Icon: Eye,
  },
  users: {
    label: 'Inscriptions',
    short: 'Inscriptions',
    color: '#3B82F6',
    gradient: ['#60A5FA', '#1D4ED8'],
    Icon: Users,
  },
  resources: {
    label: 'Nouvelles ressources',
    short: 'Ressources',
    color: '#10B981',
    gradient: ['#34D399', '#047857'],
    Icon: FileText,
  },
  downloads: {
    label: 'Téléchargements',
    short: 'Téléchargements',
    color: '#F59E0B',
    gradient: ['#FBBF24', '#B45309'],
    Icon: Download,
  },
};

const DAY_NAMES_FR = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];

function fmtKpi(n: number): string {
  if (n >= 10000) return `${Math.round(n / 1000)}k`;
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  return n.toString();
}

function fmtDayLabel(ts: number, isToday: boolean): string {
  if (isToday) return "Aujourd'hui";
  const d = new Date(ts);
  const day = DAY_NAMES_FR[d.getDay()];
  return `${day} ${d.getDate()}`;
}

function niceMax(n: number): number {
  if (n <= 5) return 5;
  if (n <= 10) return 10;
  const mag = Math.pow(10, Math.floor(Math.log10(n)));
  return Math.ceil(n / mag) * mag;
}

export function ActivityChartCard({
  days,
  maxSeries,
  showVisitors,
}: {
  days: DayData[];
  maxSeries: number;
  showVisitors: boolean;
}) {
  const seriesOrder: SeriesKey[] = showVisitors
    ? ['visitors', 'users', 'resources', 'downloads']
    : ['users', 'resources', 'downloads'];

  // Compute today's stats + delta vs yesterday
  const today = days[days.length - 1] ?? null;
  const yesterday = days[days.length - 2] ?? null;

  const kpis = seriesOrder.map((key) => {
    const todayVal = today?.[key] ?? 0;
    const yestVal = yesterday?.[key] ?? 0;
    const delta = todayVal - yestVal;
    const deltaPct = yestVal > 0 ? (delta / yestVal) * 100 : todayVal > 0 ? 100 : 0;
    return { key, today: todayVal, yesterday: yestVal, delta, deltaPct: Math.round(deltaPct) };
  });

  const totals7d = seriesOrder.map((key) => ({
    key,
    total: days.reduce((s, d) => s + d[key], 0),
  }));

  // Empty state
  const allEmpty = days.every((d) => seriesOrder.every((k) => d[k] === 0));
  if (allEmpty) {
    return (
      <div className="bg-gradient-to-br from-white via-white to-slate-50/40 rounded-2xl border border-slate-100 p-8 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center shrink-0">
            <Sparkles className="w-6 h-6 text-white" />
          </div>
          <div className="flex-1">
            <h2 className="font-bold text-lg mb-1">Activité des 7 derniers jours</h2>
            <p className="text-sm text-slate-600 mb-3">
              {showVisitors
                ? "Les données Google Analytics prennent généralement 24 à 48h pour être disponibles via l'API Data. Les compteurs remonteront dès demain."
                : "Pas encore d'activité sur les 7 derniers jours."}
            </p>
            {showVisitors && (
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <div className="w-2 h-2 rounded-full bg-violet-500 animate-pulse" />
                <span>Tracking GA actif via Cloudflare Zaraz — données en cours de collecte</span>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-6 pt-6 pb-4">
        <h2 className="font-bold text-lg flex items-center gap-2">
          <span className="inline-flex w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-500 items-center justify-center">
            <Activity className="w-4 h-4 text-white" />
          </span>
          Activité des 7 derniers jours
        </h2>
        <p className="text-xs text-slate-500 mt-1">
          Nouveaux inscrits, ressources, téléchargements et visiteurs uniques par jour
        </p>
      </div>

      {/* KPI row — today vs yesterday */}
      <div
        className={`grid gap-px bg-slate-100 ${
          seriesOrder.length === 4 ? 'grid-cols-2 lg:grid-cols-4' : 'grid-cols-1 sm:grid-cols-3'
        }`}
      >
        {kpis.map(({ key, today, delta, deltaPct }) => {
          const meta = SERIES_META[key];
          const Icon = meta.Icon;
          const isNew = today > 0 && yesterday !== null && (yesterday[key] ?? 0) === 0;
          return (
            <div key={key} className="bg-white px-5 py-4 hover:bg-slate-50/50 transition-colors">
              <div className="flex items-center gap-2 text-xs text-slate-500 mb-1.5">
                <Icon className="w-3.5 h-3.5" style={{ color: meta.color }} />
                <span className="font-medium">{meta.short}</span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-extrabold text-slate-900 tabular-nums">
                  {fmtKpi(today)}
                </span>
                {today > 0 && (
                  <span
                    className={`text-[10px] font-semibold flex items-center gap-0.5 ${
                      delta > 0
                        ? 'text-emerald-600'
                        : delta < 0
                        ? 'text-rose-600'
                        : 'text-slate-400'
                    }`}
                  >
                    {delta > 0 ? (
                      <ArrowUpRight className="w-3 h-3" />
                    ) : delta < 0 ? (
                      <ArrowDownRight className="w-3 h-3" />
                    ) : null}
                    {isNew ? 'nouveau' : `${delta > 0 ? '+' : ''}${deltaPct}%`}
                  </span>
                )}
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">aujourd'hui</div>
            </div>
          );
        })}
      </div>

      {/* Chart */}
      <div className="p-6 pt-5">
        <ActivityChart days={days} maxSeries={maxSeries} seriesOrder={seriesOrder} />
      </div>

      {/* 7d totals */}
      <div className="px-6 pb-5 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-slate-500">
        {totals7d.map(({ key, total }) => {
          const meta = SERIES_META[key];
          return (
            <div key={key} className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: meta.color }} />
              <span className="text-slate-600 font-medium">{meta.short}</span>
              <span className="text-slate-400">· 7j :</span>
              <span className="font-semibold text-slate-700 tabular-nums">
                {formatNumber(total)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ActivityChart({
  days,
  maxSeries,
  seriesOrder,
}: {
  days: DayData[];
  maxSeries: number;
  seriesOrder: SeriesKey[];
}) {
  const [hidden, setHidden] = useState<Set<SeriesKey>>(new Set());
  const [hover, setHover] = useState<number | null>(null);

  const toggle = (k: SeriesKey) => {
    const next = new Set(hidden);
    if (next.has(k)) next.delete(k);
    else next.add(k);
    setHidden(next);
  };

  // Geometry
  const W = 800;
  const H = 220;
  const PAD_L = 36;
  const PAD_R = 12;
  const PAD_T = 16;
  const PAD_B = 28;
  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;
  const xStep = innerW / Math.max(1, days.length - 1);

  const visibleSeries = seriesOrder.filter((k) => !hidden.has(k));
  const visibleMax = Math.max(1, ...days.flatMap((d) => visibleSeries.map((k) => d[k])));
  const yMax = niceMax(Math.max(maxSeries, visibleMax));

  const point = (i: number, val: number): [number, number] => {
    const x = PAD_L + i * xStep;
    const y = PAD_T + innerH - (val / yMax) * innerH;
    return [x, y];
  };

  const buildPath = (key: SeriesKey): string => {
    const pts = days.map((d, i) => point(i, d[key]));
    if (pts.length === 0) return '';
    let d = `M ${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
    for (let i = 1; i < pts.length; i++) {
      const [x0, y0] = pts[i - 1];
      const [x1, y1] = pts[i];
      const cx = (x0 + x1) / 2;
      d += ` C ${cx.toFixed(1)} ${y0.toFixed(1)}, ${cx.toFixed(1)} ${y1.toFixed(1)}, ${x1.toFixed(1)} ${y1.toFixed(1)}`;
    }
    return d;
  };

  const buildArea = (key: SeriesKey): string => {
    const path = buildPath(key);
    if (!path) return '';
    const lastX = PAD_L + (days.length - 1) * xStep;
    const baseY = PAD_T + innerH;
    return `${path} L ${lastX.toFixed(1)} ${baseY} L ${PAD_L} ${baseY} Z`;
  };

  return (
    <div className="w-full">
      {/* Interactive legend pills */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        {seriesOrder.map((key) => {
          const meta = SERIES_META[key];
          const isOff = hidden.has(key);
          return (
            <button
              key={key}
              type="button"
              onClick={() => toggle(key)}
              className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full transition-all border ${
                isOff
                  ? 'border-slate-200 text-slate-400 bg-slate-50 line-through'
                  : 'border-slate-200 text-slate-700 bg-white hover:border-slate-300'
              }`}
            >
              <span
                className="w-2.5 h-2.5 rounded-full"
                style={{ background: isOff ? '#CBD5E1' : meta.color }}
              />
              {meta.short}
            </button>
          );
        })}
      </div>

      <div className="w-full overflow-x-auto">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full"
          preserveAspectRatio="xMidYMid meet"
          style={{ minWidth: 480 }}
        >
          <defs>
            {seriesOrder.map((key) => {
              const meta = SERIES_META[key];
              const [c1, c2] = meta.gradient;
              return (
                <linearGradient key={key} id={`g-${key}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={c1} stopOpacity={0.32} />
                  <stop offset="100%" stopColor={c2} stopOpacity={0.02} />
                </linearGradient>
              );
            })}
          </defs>

          {/* Y axis grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map((p, i) => {
            const y = PAD_T + innerH * (1 - p);
            return (
              <g key={i}>
                <line x1={PAD_L} y1={y} x2={W - PAD_R} y2={y} stroke="#F1F5F9" strokeWidth={1} />
                <text
                  x={PAD_L - 6}
                  y={y + 3}
                  textAnchor="end"
                  className="text-[10px] fill-slate-400 tabular-nums"
                >
                  {fmtKpi(Math.round(yMax * p))}
                </text>
              </g>
            );
          })}

          {/* X axis labels */}
          {days.map((d, i) => {
            const x = PAD_L + i * xStep;
            const isLast = i === days.length - 1;
            return (
              <text
                key={i}
                x={x}
                y={H - 10}
                textAnchor="middle"
                className={`text-[10px] tabular-nums ${
                  isLast ? 'fill-slate-800 font-semibold' : 'fill-slate-500'
                }`}
              >
                {fmtDayLabel(d.ts, isLast)}
              </text>
            );
          })}

          {/* Area gradients (under lines) */}
          {visibleSeries.map((key) => (
            <path
              key={`area-${key}`}
              d={buildArea(key)}
              fill={`url(#g-${key})`}
              opacity={0.9}
            />
          ))}

          {/* Lines */}
          {visibleSeries.map((key) => {
            const meta = SERIES_META[key];
            return (
              <path
                key={`line-${key}`}
                d={buildPath(key)}
                fill="none"
                stroke={meta.color}
                strokeWidth={2.5}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            );
          })}

          {/* Permanent dots (when no hover) */}
          {hover === null &&
            days.map((d, i) =>
              seriesOrder.map((key) => {
                if (d[key] === 0 || hidden.has(key)) return null;
                const meta = SERIES_META[key];
                const [x, y] = point(i, d[key]);
                return (
                  <g key={`${i}-${key}`}>
                    <circle cx={x} cy={y} r={5} fill="white" />
                    <circle cx={x} cy={y} r={3} fill={meta.color} />
                  </g>
                );
              }),
            )}

          {/* Hover layer (transparent rects) */}
          {days.map((d, i) => {
            const x = PAD_L + i * xStep - xStep / 2;
            return (
              <rect
                key={`hit-${i}`}
                x={x}
                y={PAD_T}
                width={xStep}
                height={innerH}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover((h) => (h === i ? null : h))}
                style={{ cursor: 'crosshair' }}
              />
            );
          })}

          {/* Hover guide */}
          {hover !== null &&
            (() => {
              const x = PAD_L + hover * xStep;
              return (
                <line
                  x1={x}
                  y1={PAD_T}
                  x2={x}
                  y2={PAD_T + innerH}
                  stroke="#94A3B8"
                  strokeWidth={1}
                  strokeDasharray="3 3"
                  pointerEvents="none"
                />
              );
            })()}

          {/* Hover dots */}
          {hover !== null &&
            visibleSeries.map((key) => {
              const d = days[hover];
              if (!d || d[key] === 0) return null;
              const meta = SERIES_META[key];
              const [x, y] = point(hover, d[key]);
              return (
                <g key={`dot-${key}-${hover}`} pointerEvents="none">
                  <circle cx={x} cy={y} r={6} fill="white" />
                  <circle cx={x} cy={y} r={4} fill={meta.color} />
                </g>
              );
            })}

          {/* Tooltip */}
          {hover !== null &&
            (() => {
              const d = days[hover];
              const isLast = hover === days.length - 1;
              const x = PAD_L + hover * xStep;
              const lines = visibleSeries
                .filter((k) => d[k] > 0)
                .map((k) => ({ key: k, value: d[k] }));
              if (lines.length === 0) return null;
              const tipW = 140;
              const tipH = 16 + lines.length * 16 + 10;
              const tipX = x + 60 > W ? x - tipW - 10 : x + 10;
              const tipY = PAD_T + 4;
              return (
                <g pointerEvents="none">
                  <rect
                    x={tipX}
                    y={tipY}
                    width={tipW}
                    height={tipH}
                    rx={8}
                    fill="white"
                    stroke="#E2E8F0"
                    strokeWidth={1}
                    filter="drop-shadow(0 2px 4px rgba(0,0,0,0.08))"
                  />
                  <text
                    x={tipX + 8}
                    y={tipY + 13}
                    className="text-[10px] font-semibold fill-slate-700"
                  >
                    {fmtDayLabel(d.ts, isLast)}
                  </text>
                  {lines.map((l, idx) => {
                    const meta = SERIES_META[l.key];
                    return (
                      <g key={l.key}>
                        <circle
                          cx={tipX + 14}
                          cy={tipY + 26 + idx * 16 - 3}
                          r={3}
                          fill={meta.color}
                        />
                        <text
                          x={tipX + 22}
                          y={tipY + 26 + idx * 16}
                          className="text-[10px] fill-slate-600"
                        >
                          {meta.short}
                        </text>
                        <text
                          x={tipX + tipW - 8}
                          y={tipY + 26 + idx * 16}
                          textAnchor="end"
                          className="text-[10px] font-semibold fill-slate-900 tabular-nums"
                        >
                          {formatNumber(l.value)}
                        </text>
                      </g>
                    );
                  })}
                </g>
              );
            })()}
        </svg>
      </div>
    </div>
  );
}
