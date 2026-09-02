'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useTransition } from 'react';
import { ArrowUpDown } from 'lucide-react';

const OPTIONS = [
  { value: 'popular', label: 'Plus actifs' },
  { value: 'rating', label: 'Mieux notés' },
  { value: 'followers', label: 'Plus suivis' },
  { value: 'recent', label: 'Plus récents' },
  { value: 'name', label: 'Nom (A-Z)' },
] as const;

export default function TeachersSort({ current }: { current: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  function onChange(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === 'popular') params.delete('sort');
    else params.set('sort', value);
    params.delete('page'); // reset pagination on sort change
    startTransition(() => {
      router.push(`/professeurs?${params.toString()}`);
    });
  }

  return (
    <div className="flex items-center gap-2">
      <ArrowUpDown className="w-4 h-4 text-slate-400 hidden sm:block" />
      <label htmlFor="sort" className="text-sm text-slate-500 hidden sm:inline">
        Trier par :
      </label>
      <select
        id="sort"
        value={current}
        onChange={(e) => onChange(e.target.value)}
        className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-300 focus:border-amber-400 cursor-pointer transition"
      >
        {OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
