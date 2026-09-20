'use client';
/**
 * Preview of the 7 real watercolor PNG brushes.
 *
 * 2026-09-19 v3: Replaced the 9-variant SVG generator preview with a
 * direct view of the 7 generated PNG brushes (one per niveau).
 * Each brush is a real watercolor image rendered via Python+PIL
 * (see scripts/generate_brushes.py).
 */
import { Sparkles } from 'lucide-react';
import MenuSideDrawer from '@/components/mega-menu/MenuSideDrawer';
import { BRUSH_BY_NIVEAU_SLUG, BRUSH_PUBLIC_PATH, type BrushColor } from '@/components/mega-menu/brush-config';

const NIVEAUX: Array<{
  slug: string;
  label: { fr: string; ar: string };
  color: BrushColor;
}> = [
  { slug: '7eme', label: { fr: '7ème année', ar: 'السابعة أساسي' }, color: BRUSH_BY_NIVEAU_SLUG['7eme'] },
  { slug: '8eme', label: { fr: '8ème année', ar: 'الثامنة أساسي' }, color: BRUSH_BY_NIVEAU_SLUG['8eme'] },
  { slug: '9eme', label: { fr: '9ème année', ar: 'التاسعة أساسي' }, color: BRUSH_BY_NIVEAU_SLUG['9eme'] },
  { slug: '1ere', label: { fr: '1ère secondaire', ar: 'الأولى ثانوي' }, color: BRUSH_BY_NIVEAU_SLUG['1ere-secondaire'] },
  { slug: '2eme', label: { fr: '2ème secondaire', ar: 'الثانية ثانوي' }, color: BRUSH_BY_NIVEAU_SLUG['2eme-secondaire'] },
  { slug: '3eme', label: { fr: '3ème secondaire', ar: 'الثالثة ثانوي' }, color: BRUSH_BY_NIVEAU_SLUG['3eme-secondaire'] },
  { slug: 'bac',  label: { fr: 'Bac', ar: 'الباكالوريا' }, color: BRUSH_BY_NIVEAU_SLUG['4eme-secondaire'] },
];

export default function PreviewBrushesPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 pt-20 pb-16">
      <div className="max-w-7xl mx-auto px-4">
        {/* Header */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-full text-sm text-slate-700 shadow-sm mb-4">
            <Sparkles className="w-4 h-4 text-amber-500" />
            <span className="font-semibold">7 brush strokes aquarelle (PIL-generated PNG)</span>
          </div>
          <h1 className="text-3xl font-extrabold text-slate-900 mb-2">
            Brushes aquarelle — Aperçu
          </h1>
          <p className="text-slate-600 max-w-2xl mx-auto">
            Chaque brush est un PNG transparent généré par Python+PIL avec
            stries directionnelles, bouts effilés, fibres dry-brush et
            légère asymétrie. Une couleur par niveau (7ème→4ème).
          </p>
        </div>

        {/* Brush grid */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-12">
          {NIVEAUX.map(({ slug, label, color }) => (
            <div
              key={slug}
              className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden"
            >
              {/* Visual preview */}
              <div className="relative h-40 flex items-center justify-center bg-gradient-to-br from-slate-50 to-white px-4">
                <div className="relative inline-flex items-center justify-center w-full">
                  <img
                    src={BRUSH_PUBLIC_PATH(color)}
                    alt=""
                    aria-hidden="true"
                    className="absolute left-1/2 top-1/2 w-[calc(100%+24px)] h-auto -translate-x-1/2 -translate-y-1/2 z-0 pointer-events-none select-none"
                    draggable={false}
                  />
                  <span className="relative z-10 font-bold text-base text-slate-900 px-3 py-1">
                    {label.fr}
                  </span>
                </div>
              </div>
              {/* Meta */}
              <div className="px-4 py-3 border-t border-slate-100 bg-slate-50/50">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-bold text-slate-800">{label.fr}</div>
                    <div className="text-xs text-slate-500" dir="rtl">{label.ar}</div>
                  </div>
                  <code className="text-[10px] text-slate-400 bg-white border border-slate-200 px-1.5 py-0.5 rounded">
                    brush-{color}.svg
                  </code>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Drawer preview */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <h2 className="font-extrabold text-lg text-slate-900 mb-2">
            En contexte dans le drawer
          </h2>
          <p className="text-sm text-slate-600 mb-4">
            Le brush est placé derrière le label du niveau. Il s'adapte
            automatiquement à la longueur du texte via
            <code className="mx-1 px-1.5 py-0.5 bg-slate-100 rounded text-xs">
              width: calc(100% + 32px)
            </code>
            et ne s'affiche qu'au-dessus du label (jamais en overflow).
          </p>
          <div className="relative bg-slate-50 rounded-xl p-4 border border-slate-200">
            <MenuSideDrawer triggerLabel={{ fr: 'Classes', ar: 'الأقسام' }} />
          </div>
        </div>
      </div>
    </div>
  );
}
