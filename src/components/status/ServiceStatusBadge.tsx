'use client';

import { useEffect, useState } from 'react';
import { Link } from '@/i18n/navigation';
import { loadUptime, examanetMonitors } from './useServiceStatus';

/**
 * Badge compact d'état du service, à placer dans le pied de page.
 * Source de vérité : la route publique /api/status/uptime (cache 60 s côté
 * worker + monitoring externe UptimeRobot).
 *
 * 2026-11-18 : le fetch passe par `loadUptime()` (promesse partagée) au lieu
 * d'un fetch direct. Le composant est monté 2 fois sur un affichage de page
 * (mode strict React + remontée après hydratation) et le fetch direct
 * déclenchait 2 requêtes par affichage, visibles dans les logs Cloudflare.
 */

type BadgeLabels = {
  operational: string;
  degraded: string;
  down: string;
  link: string;
};

export default function ServiceStatusBadge({
  labels,
  href,
}: {
  labels: BadgeLabels;
  href: string;
}) {
  const [state, setState] = useState<'unknown' | 'up' | 'degraded' | 'down'>('unknown');

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const json = await loadUptime();
        if (!alive) return;
        const down = examanetMonitors(json).filter((m) => m.down).length;
        if (!json.ok && down > 0) setState('down');
        else if (!json.ok) setState('degraded');
        else setState('up');
      } catch {
        if (alive) setState('unknown');
      }
    };
    load();
    const timer = setInterval(load, 120_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  const map = {
    unknown: { dot: 'bg-slate-400', text: 'text-slate-300', label: '' },
    up: { dot: 'bg-emerald-400', text: 'text-emerald-300', label: labels.operational },
    degraded: { dot: 'bg-amber-400', text: 'text-amber-300', label: labels.degraded },
    down: { dot: 'bg-red-500', text: 'text-red-300', label: labels.down },
  } as const;

  const s = map[state];

  return (
    <Link
      href={href}
      className="inline-flex items-center gap-2 text-xs text-slate-400 hover:text-slate-200 transition"
      aria-label={labels.link}
    >
      <span className={`w-2 h-2 rounded-full ${s.dot} ${state === 'unknown' ? 'animate-pulse' : ''}`} />
      <span className={s.text}>
        {state === 'unknown' ? labels.link : `${labels.link} · ${s.label}`}
      </span>
    </Link>
  );
}
