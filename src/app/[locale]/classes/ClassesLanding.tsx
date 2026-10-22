'use client';

/**
 * Shared renderer for the class / section SEO landing pages.
 *
 * 2026-10-22 — client component because ResourceCard uses hooks and we want the
 * resource grid to hydrate independently. Everything SEO-critical (H1, intro,
 * FAQ) lives in the server page and is rendered server-side — this component
 * only draws the visual grid + FAQ accordion.
 *
 * JSON-LD is emitted by the SERVER page (one <script> per schema, Leçon #108),
 * never here.
 */

import { useState } from 'react';
import { Link } from '@/i18n/navigation';
import { ChevronDown } from 'lucide-react';
import ResourceCard, { type ResourceCardData } from '@/components/resources/ResourceCard';

export type LandingResource = ResourceCardData;

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-slate-200 last:border-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-3 py-4 text-start text-sm font-semibold text-slate-800 hover:text-primary-700 transition"
      >
        <span>{q}</span>
        <ChevronDown
          className={`w-4 h-4 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open ? <p className="pb-4 text-sm text-slate-600 leading-relaxed">{a}</p> : null}
    </div>
  );
}

export default function ClassesLanding({
  resources,
  total,
  isAr,
  faq,
  /** link to the full filtered listing (the mega menu used to point here only) */
  browseAllHref,
  browseAllLabel,
}: {
  resources: LandingResource[];
  total: number;
  isAr: boolean;
  faq: { q: string; a: string }[];
  browseAllHref: string;
  browseAllLabel: string;
}) {
  return (
    <div className="space-y-10">
      {resources.length > 0 ? (
        <section>
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-xl font-extrabold text-slate-900">
              {isAr ? 'أحدث الموارد' : 'Ressources récentes'}
            </h2>
            <span className="text-sm text-slate-500 tabular-nums">
              {new Intl.NumberFormat(isAr ? 'ar-TN' : 'fr-FR').format(total)}{' '}
              {isAr ? 'مورد' : 'ressources'}
            </span>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {resources.map((r) => (
              <ResourceCard key={r.id} resource={r} />
            ))}
          </div>

          {total > resources.length ? (
            <div className="mt-6 text-center">
              <Link
                href={browseAllHref}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary-600 hover:bg-primary-700 text-white text-sm font-semibold transition"
              >
                {browseAllLabel}
              </Link>
            </div>
          ) : null}
        </section>
      ) : (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
          <p className="text-sm text-slate-600">
            {isAr
              ? 'لا توجد موارد في هذا القسم بعد. عد قريبًا!'
              : 'Pas encore de ressources dans cette filière. Revenez bientôt !'}
          </p>
          <Link
            href={browseAllHref}
            className="mt-3 inline-block text-sm font-semibold text-primary-700 hover:underline"
          >
            {browseAllLabel}
          </Link>
        </div>
      )}

      {faq.length > 0 ? (
        <section className="max-w-3xl">
          <h2 className="text-xl font-extrabold text-slate-900 mb-3">
            {isAr ? 'أسئلة شائعة' : 'Questions fréquentes'}
          </h2>
          <div className="bg-white rounded-2xl border border-slate-200 px-5">
            {faq.map((f, i) => (
              <FaqItem key={i} q={f.q} a={f.a} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}