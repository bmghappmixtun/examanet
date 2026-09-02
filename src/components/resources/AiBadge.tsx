'use client';
/**
 * AiBadge — tiny client island for the AI tooltip on the AI description card.
 *
 * The full AiDescription.tsx (653 lines) is mostly static markup that
 * could be a server component, but contains a single useState for a
 * hover tooltip. To avoid shipping the entire card as client JS, we
 * extract just the badge into this 25-line client component.
 *
 * The rest of AiDescription stays server-rendered, saving ~40 KB gz
 * from the resource page bundle.
 */

import { Sparkles } from 'lucide-react';

export default function AiBadge({ isRtl }: { isRtl: boolean }) {
  return (
    <div
      className="relative flex-shrink-0 group"
      role="presentation"
    >
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gradient-to-r from-violet-100 to-indigo-100 border border-violet-200 text-violet-700 cursor-help text-[10px] font-bold uppercase tracking-wide">
        IA
      </span>
      {/* Pure CSS tooltip — no JS state needed */}
      <span
        className={`pointer-events-none absolute z-50 top-full mt-1.5 w-56 px-3 py-2 rounded-lg bg-slate-900 text-white text-xs leading-relaxed shadow-xl opacity-0 translate-y-1 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-150 ${isRtl ? 'start-0' : 'end-0'}`}
      >
        <span className="block font-semibold mb-0.5">
          {isRtl ? '✨ ملخص مُولَّد بالذكاء الاصطناعي' : '✨ Résumé généré par IA'}
        </span>
        <span className="block opacity-90">
          {isRtl
            ? 'قد يحتوي على أخطاء. تحقق من الملف الأصلي.'
            : 'Peut contenir des erreurs. Vérifiez le fichier original.'}
        </span>
      </span>
    </div>
  );
}
