'use client';
// @ts-nocheck
import { notFound } from 'next/navigation';
import { Sparkles } from 'lucide-react';
import MenuSideDrawer from '@/components/mega-menu/MenuSideDrawer';
import { BRUSH_VARIANTS } from '@/components/mega-menu/brush-config';

export default async function PreviewBrushesPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 pt-20 pb-16">
      <div className="max-w-7xl mx-auto px-4">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-full text-sm text-slate-700 shadow-sm mb-4">
            <Sparkles className="w-4 h-4 text-amber-500" />
            <span className="font-semibold">9 combinaisons brush stroke</span>
          </div>
          <h1 className="text-3xl font-extrabold text-slate-900 mb-2">
            Choisis le style du menu Classes
          </h1>
          <p className="text-slate-600 max-w-2xl mx-auto">
            Chaque variante = une couleur × une position. Clique sur
            n'importe quel bouton "Classes" ci-dessous pour ouvrir le
            drawer et voir le brush stroke en contexte.
          </p>
        </div>

        {/* Color legend */}
        <div className="mb-6 grid sm:grid-cols-3 gap-3 max-w-3xl mx-auto">
          <div className="bg-white rounded-xl p-3 border border-slate-200">
            <div className="font-bold text-xs text-emerald-700 mb-1">A. Par cycle</div>
            <div className="text-xs text-slate-600">Tous les niveaux Collège = mint, Lycée = lavender</div>
          </div>
          <div className="bg-white rounded-xl p-3 border border-slate-200">
            <div className="font-bold text-xs text-violet-700 mb-1">B. Par niveau</div>
            <div className="text-xs text-slate-600">Chaque niveau a sa propre couleur (arc-en-ciel)</div>
          </div>
          <div className="bg-white rounded-xl p-3 border border-slate-200">
            <div className="font-bold text-xs text-amber-700 mb-1">C. Harmonisée</div>
            <div className="text-xs text-slate-600">Rotation de pastels, cycle-agnostique</div>
          </div>
        </div>

        {/* Position legend */}
        <div className="mb-8 grid sm:grid-cols-3 gap-3 max-w-3xl mx-auto text-xs">
          <div className="bg-white rounded-xl p-3 border border-slate-200">
            <div className="font-bold text-slate-700 mb-1">1. Coin haut-droite</div>
            <div className="text-slate-500">Petit cercle flou en arrière-plan du card</div>
          </div>
          <div className="bg-white rounded-xl p-3 border border-slate-200">
            <div className="font-bold text-slate-700 mb-1">2. Bande diagonale</div>
            <div className="text-slate-500">Bande large qui traverse le card en diagonale</div>
          </div>
          <div className="bg-white rounded-xl p-3 border border-slate-200">
            <div className="font-bold text-slate-700 mb-1">3. Halo derrière icône</div>
            <div className="text-slate-500">Blob pastel derrière l'icône du niveau</div>
          </div>
        </div>

        {/* 3x3 Grid of variants */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {BRUSH_VARIANTS.map((v) => (
            <div
              key={v.code}
              className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden"
            >
              {/* Card header */}
              <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/50">
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-8 h-8 rounded-lg bg-slate-900 text-white flex items-center justify-center text-sm font-extrabold">
                    {v.code}
                  </div>
                  <div>
                    <div className="font-bold text-sm text-slate-900">
                      {v.colorLabel} · {v.shapeLabel}
                    </div>
                  </div>
                </div>
                <p className="text-xs text-slate-500 leading-relaxed mt-1">
                  {v.description}
                </p>
              </div>

              {/* Embedded drawer (auto-opens via internal state) */}
              <div className="p-4 bg-gradient-to-br from-slate-50 to-slate-100">
                <EmbeddedDrawer variant={v} />
              </div>
            </div>
          ))}
        </div>

        {/* Recommendation panel */}
        <div className="mt-10 max-w-3xl mx-auto bg-white rounded-2xl border border-slate-200 p-6">
          <h2 className="font-extrabold text-lg text-slate-900 mb-3">
            💡 Mon avis (subjectif)
          </h2>
          <div className="space-y-2 text-sm text-slate-700">
            <p>
              <strong className="text-emerald-700">B2 (par niveau + diagonale)</strong> :
              Le plus identifiant — chaque niveau a sa propre couleur,
              immédiatement reconnaissable visuellement.
            </p>
            <p>
              <strong className="text-violet-700">A1 (par cycle + coin)</strong> :
              Le plus équilibré — cohérence visuelle (Collège vs Lycée)
              sans surcharger.
            </p>
            <p>
              <strong className="text-amber-700">C3 (harmonisé + halo)</strong> :
              Le plus discret — ajoute une touche de couleur sans
              dominer le design monochrome.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Embedded drawer — wraps MenuSideDrawer in a "fake header" + a trigger
 * area. The drawer's button is visible immediately so the user can
 * click to open and see the brush strokes.
 */
function EmbeddedDrawer({ variant }: { variant: import('@/components/mega-menu/brush-config').BrushVariant }) {
  return (
    <div className="relative">
      {/* Mock header bar */}
      <div className="bg-white rounded-xl border border-slate-200 px-3 py-2 flex items-center gap-2 mb-3">
        <div className="w-6 h-6 rounded bg-slate-200 shrink-0" />
        <div className="text-xs font-semibold text-slate-700">Examanet</div>
        <div className="ms-auto flex items-center gap-2">
          <MenuSideDrawer
            brushVariant={variant}
            triggerLabel={{ fr: `Variante ${variant.code}`, ar: `نموذج ${variant.code}` }}
          />
        </div>
      </div>

      {/* Visual hint */}
      <div className="text-center text-[11px] text-slate-500 italic">
        ↑ Clique "{`Variante ${variant.code}`}" pour voir le brush stroke
      </div>
    </div>
  );
}
