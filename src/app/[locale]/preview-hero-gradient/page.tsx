'use client';

/**
 * /preview-hero-gradient — 2026-10-21
 *
 * DEMO ONLY (not linked in the nav, not in the sitemap).
 *
 * Goal: replace the BLUE gradient of the homepage hero card
 * (currently `bg-gradient-to-br from-primary-500 to-primary-700`)
 * with the ORANGE → TEAL brand gradient taken from the Examanet logo.
 *
 * This route renders the hero card side by side with 3 candidate
 * gradients so the user can pick one before touching HomeClient.tsx.
 *
 * Brand palette extracted from public/logo-*.png:
 *   orange  #F0903C  #E4843C  #D86C30  #FCB46C
 *   teal    #006078  #004860  #246C84  #307884
 */

import { useState } from 'react';
import { Download, Star, Check } from 'lucide-react';
import BrandBooks, { BRAND_BOOKS_PALETTES } from '@/components/shared/BrandBooks';

type Variant = {
  id: string;
  label: string;
  hint: string;
  /** CSS background value (applied on the rotated card) */
  background: string;
  /** Shadow color for the drop shadow */
  shadow: string;
};

const VARIANTS: Variant[] = [
  {
    id: 'current',
    label: 'ACTUEL (bleu)',
    hint: 'from-primary-500 → to-primary-700 · bg-gradient-to-br',
    background: 'linear-gradient(135deg, #0EA5E9 0%, #0284C7 45%, #0369A1 100%)',
    shadow: 'rgba(14, 165, 233, 0.40)',
  },
  {
    id: 'a',
    label: 'A — Logo diagonal',
    hint: 'orange #F0903C (haut-gauche) → teal #006078 (bas-droite) + glow central',
    background:
      'radial-gradient(62% 52% at 70% 30%, rgba(255,224,186,0.55) 0%, rgba(255,224,186,0) 68%),' +
      'linear-gradient(150deg, #F0913E 0%, #E07A4C 26%, #4E8A73 66%, #006078 100%)',
    shadow: 'rgba(240, 144, 60, 0.38)',
  },
  {
    id: 'b',
    label: 'B — Top-to-bottom',
    hint: 'orange en haut → teal en bas, direction verticale (comme l’image 1)',
    background:
      'radial-gradient(70% 45% at 62% 34%, rgba(255,235,205,0.45) 0%, rgba(255,235,205,0) 70%),' +
      'linear-gradient(178deg, #F2964A 0%, #E58250 22%, #3E8B7B 58%, #006078 100%)',
    shadow: 'rgba(240, 144, 60, 0.38)',
  },
  {
    id: 'c',
    label: 'C — Teal dominant',
    hint: 'teal en haut → orange en bas (inversé, plus “cool”)',
    background:
      'radial-gradient(65% 48% at 32% 26%, rgba(255,255,255,0.28) 0%, rgba(255,255,255,0) 72%),' +
      'linear-gradient(155deg, #00788F 0%, #006078 30%, #3E8B7B 58%, #E9964E 100%)',
    shadow: 'rgba(0, 96, 120, 0.40)',
  },
];

function HeroCard({
  v,
  title,
  desc,
  palette,
}: {
  v: Variant;
  title: string;
  desc: string;
  palette: string;
}) {
  return (
    <div className="relative w-full max-w-md mx-auto aspect-square">
      {/* The rotated card */}
      <div
        className="absolute inset-0 rounded-3xl shadow-2xl rotate-3 hover:rotate-0 transition-transform duration-500 flex items-center justify-center overflow-hidden"
        style={{ background: v.background, boxShadow: `0 25px 50px -12px ${v.shadow}` }}
      >
        <div className="text-center text-white p-8 relative z-10">
          <BrandBooks palette={palette} className="w-40 h-[132px] mx-auto mb-4" />
          <div className="text-2xl font-extrabold">{title}</div>
          <div className="text-lg opacity-90">{desc}</div>
        </div>
      </div>

      {/* Downloads badge — top right */}
      <div className="absolute -top-4 -end-4 bg-white rounded-2xl shadow-2xl p-4 animate-float">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
            <Download className="w-5 h-5 text-green-600" />
          </div>
          <div>
            <div className="text-xs text-slate-500">Téléchargements</div>
            <div className="text-lg font-bold">30.9k</div>
          </div>
        </div>
      </div>

      {/* Rating badge — bottom left */}
      <div
        className="absolute -bottom-4 -start-4 bg-white rounded-2xl shadow-2xl p-4 animate-float"
        style={{ animationDelay: '1s' }}
      >
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
            <Star className="w-5 h-5 fill-amber-500 text-amber-500" />
          </div>
          <div>
            <div className="text-xs text-slate-500">Note moyenne</div>
            <div className="text-lg font-bold">4.8/5</div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PreviewHeroGradient() {
  const [picked, setPicked] = useState<string | null>('a');
  const [palette, setPalette] = useState<string>('contrast');

  return (
    <div className="min-h-screen bg-slate-50 py-10 px-4">
      <div className="max-w-7xl mx-auto">
        <div className="bg-white border border-slate-200 rounded-2xl p-6 mb-8">
          <h1 className="text-2xl font-extrabold text-slate-900 mb-2">
            Démo — fond du hero homepage (bleu → dégradé orange/teal)
          </h1>
          <p className="text-sm text-slate-600">
            Clique sur la variante que tu veux. Rien n’est appliqué au vrai site tant que
            tu n’as pas choisi — cette page est un aperçu isolé.
          </p>
          <div className="flex flex-wrap gap-3 mt-4">
            {VARIANTS.map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => setPicked(v.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition ${
                  picked === v.id
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white text-slate-600 border-slate-300 hover:border-slate-500'
                }`}
              >
                {picked === v.id ? '✓ ' : ''}
                {v.label}
              </button>
            ))}
          </div>

          <div className="mt-4 pt-4 border-t border-slate-200">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">
              Palette des 3 livres
            </p>
            <div className="flex flex-wrap gap-3">
              {Object.entries(BRAND_BOOKS_PALETTES).map(([key, p]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setPalette(key)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition ${
                    palette === key
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-white text-slate-600 border-slate-300 hover:border-slate-500'
                  }`}
                  title={p.hint}
                >
                  {palette === key ? '✓ ' : ''}
                  {p.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-slate-500 mt-2">
              {BRAND_BOOKS_PALETTES[palette]?.hint}
            </p>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-10">
          {VARIANTS.map((v) => (
            <div
              key={v.id}
              className={`bg-white border rounded-2xl p-6 ${
                picked === v.id ? 'border-slate-900 ring-2 ring-slate-900' : 'border-slate-200'
              }`}
            >
              <div className="flex items-start justify-between gap-3 mb-5">
                <div>
                  <h2 className="font-extrabold text-slate-900">{v.label}</h2>
                  <p className="text-xs text-slate-500 mt-0.5 font-mono">{v.hint}</p>
                </div>
                {picked === v.id ? (
                  <span className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-900 text-white text-xs font-bold">
                    <Check className="w-3.5 h-3.5" /> Choisi
                  </span>
                ) : null}
              </div>

              <HeroCard
                v={v}
                palette={palette}
                title="100% gratuit"
                desc="Toutes les ressources sont accessibles sans aucun frais."
              />

              <pre className="mt-6 text-[10px] leading-relaxed bg-slate-900 text-slate-200 rounded-xl p-3 overflow-x-auto">
{`background: '${v.background}',
boxShadow: '0 25px 50px -12px ${v.shadow}',`}
              </pre>
            </div>
          ))}
        </div>

        {/* Full-width preview of the picked variant, in the real hero context */}
        <div className="mt-10 bg-white border border-slate-200 rounded-2xl p-6">
          <h2 className="font-extrabold text-slate-900 mb-4">
            Contexte réel (section hero) — variante sélectionnée
          </h2>
          <div className="relative bg-gradient-to-br from-primary-50 via-white to-sky-50 overflow-hidden rounded-2xl border border-slate-100">
            <div className="absolute top-20 -start-20 w-48 h-48 bg-primary-200 rounded-full mix-blend-multiply filter blur-3xl opacity-30" />
            <div className="absolute top-40 -end-20 w-48 h-48 bg-amber-200 rounded-full mix-blend-multiply filter blur-3xl opacity-30" />
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 relative">
              <div className="grid lg:grid-cols-2 gap-12 items-center">
                <div>
                  <div className="inline-flex items-center gap-2 bg-white border border-primary-200 rounded-full px-4 py-2 mb-6 shadow-sm">
                    <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                    <span className="text-xs font-semibold text-slate-700">
                      +12 400 ressources
                    </span>
                  </div>
                  <h2 className="text-4xl font-extrabold leading-[1.05] mb-4 text-slate-900">
                    Révise ton Bac <span className="gradient-text">gratuitement</span>
                  </h2>
                  <p className="text-lg text-slate-600 mb-6 max-w-xl">
                    Cours, devoirs, exercices et sujets de bac corrigés — pour le collège et
                    le lycée, en français et en arabe.
                  </p>
                  <div className="flex flex-wrap gap-3">
                    <span className="btn-primary">Explorer les ressources</span>
                    <span className="btn-accent">Devenir enseignant</span>
                  </div>
                </div>
                <div>
                  {VARIANTS.filter((v) => (picked ?? 'a') === v.id).map((v) => (
                    <HeroCard
                      key={v.id}
                      v={v}
                      palette={palette}
                      title="100% gratuit"
                      desc="Toutes les ressources sont accessibles sans aucun frais."
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
