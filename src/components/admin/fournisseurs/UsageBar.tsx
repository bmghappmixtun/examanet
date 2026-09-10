/**
 * UsageBar — small KPI tile for admin/fournisseurs cards.
 *
 * Shows an icon + label + value in a compact, colored card.
 * Used in CloudflareCard, D1Card, R2Card for individual metrics.
 */

import { ReactNode } from 'react';
import { formatNumber } from '@/lib/admin/quota';

export function UsageBar({
  icon,
  label,
  value,
  formatAsNumber = true,
}: {
  icon: ReactNode;
  label: string;
  /** String already formatted, or a number that will go through formatNumber */
  value: string | number;
  /** If true (default) and value is a number, format with French locale */
  formatAsNumber?: boolean;
}) {
  const display =
    typeof value === 'number' && formatAsNumber ? formatNumber(value) : value;

  return (
    <div className="flex items-center gap-2 p-2 bg-slate-50 rounded-lg">
      <div className="shrink-0">{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="text-[10px] text-slate-500 uppercase font-semibold tracking-wider truncate">
          {label}
        </div>
        <div className="text-sm font-bold text-slate-900 truncate">{display}</div>
      </div>
    </div>
  );
}
