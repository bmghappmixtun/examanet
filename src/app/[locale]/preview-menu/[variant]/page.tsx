// @ts-nocheck
import { Link } from '@/i18n/navigation';
import { notFound } from 'next/navigation';
import { ChevronLeft, ChevronRight, ExternalLink, Sparkles } from 'lucide-react';
import { MEGA_MENU_DATA, flattenMegaMenuLinks } from '@/lib/mega-menu-data';
import MenuDropdownPanel from '@/components/mega-menu/MenuDropdownPanel';
import MenuModalOverlay from '@/components/mega-menu/MenuModalOverlay';
import MenuSideDrawer from '@/components/mega-menu/MenuSideDrawer';
import MenuCompactBar from '@/components/mega-menu/MenuCompactBar';
import MenuVisualCards from '@/components/mega-menu/MenuVisualCards';

const VARIANTS = [
  {
    id: 1,
    name: 'Dropdown Panel',
    description: 'Mega menu classique au hover, panneau qui descend du header.',
    pros: ['Familier, rapide', 'Faible friction'],
    cons: ['Pas adapté au tactile', 'Espace vertical limité'],
    Component: MenuDropdownPanel,
    variant: 'hover',
  },
  {
    id: 2,
    name: 'Modal Overlay',
    description: 'Modal centré avec onglets Collège/Lycée et cartes.',
    pros: ['Adapté mobile/tablette', 'Très focalisé'],
    cons: ['Plus de clics', 'Interrompt le flux'],
    Component: MenuModalOverlay,
    variant: 'click-modal',
  },
  {
    id: 3,
    name: 'Side Drawer',
    description: 'Tiroir latéral droit, liste verticale collapsible.',
    pros: ['Mobile-friendly', 'Scroll vertical pour beaucoup de sections'],
    cons: ['Mono-colonne', 'Plus de clics pour atteindre une section'],
    Component: MenuSideDrawer,
    variant: 'click-drawer',
  },
  {
    id: 4,
    name: 'Compact Bar',
    description: 'Barre horizontale dense, onglets + sections visibles.',
    pros: ['Compact (~200px)', 'Info-dense'],
    cons: ['Peut surcharger', 'Pas mobile-friendly'],
    Component: MenuCompactBar,
    variant: 'hover-compact',
  },
  {
    id: 5,
    name: 'Visual Cards',
    description: 'Cartes visuelles avec gradient, expand-on-click.',
    pros: ['Visuellement premium', 'Identité couleur par section'],
    cons: ['Plus de place verticale', 'Plus complexe'],
    Component: MenuVisualCards,
    variant: 'hover-cards',
  },
];

export const dynamic = 'force-dynamic';
export const metadata = {
  robots: { index: false, follow: false },
};

export default async function PreviewMenuPage({
  params,
}: {
  params: Promise<{ variant: string; locale: string }>;
}) {
  const { variant: variantStr, locale } = await params;
  const id = parseInt(variantStr, 10);
  if (isNaN(id) || id < 1 || id > 5) notFound();

  const v = VARIANTS[id - 1];
  const MenuComponent = v.Component;
  const allLinks = flattenMegaMenuLinks();

  // Determine hint message based on variant
  const hint =
    v.variant.startsWith('hover')
      ? '💡 Survole le bouton "Niveaux" pour ouvrir le menu'
      : v.variant === 'click-modal'
      ? '💡 Clique sur "Niveaux" pour ouvrir le modal'
      : '💡 Clique sur "Niveaux" pour ouvrir le tiroir';

  const isAr = locale === 'ar';

  return (
    <div className="min-h-screen bg-slate-50 pt-24 pb-12">
      <div className="max-w-6xl mx-auto px-4">
        {/* Variant nav */}
        <div className="mb-6 flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            {id > 1 && (
              <Link
                href={`/${locale}/preview-menu/${id - 1}`}
                className="inline-flex items-center gap-1 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-sm font-semibold hover:bg-slate-50 transition"
              >
                <ChevronLeft className="w-4 h-4" /> Précédent
              </Link>
            )}
            <Link
              href={`/${locale}/preview-menu`}
              className="inline-flex items-center gap-1 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-sm font-semibold hover:bg-slate-50 transition"
            >
              📋 Toutes les propositions
            </Link>
            {id < 5 && (
              <Link
                href={`/${locale}/preview-menu/${id + 1}`}
                className="inline-flex items-center gap-1 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-sm font-semibold hover:bg-slate-50 transition"
              >
                Suivant <ChevronRight className="w-4 h-4" />
              </Link>
            )}
          </div>
          <div className="text-sm text-slate-600">
            Proposition <strong className="text-slate-900">{id}/5</strong> ·{' '}
            <span className="font-semibold">{v.name}</span>
          </div>
        </div>

        {/* Variant info card */}
        <div className="bg-gradient-to-br from-primary-50 to-violet-50 rounded-2xl p-5 mb-6 border border-primary-100">
          <div className="flex items-start gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-white border border-primary-200 flex items-center justify-center text-xl">
              ✨
            </div>
            <div>
              <h1 className="font-extrabold text-xl text-slate-900">
                Proposition #{id} — {v.name}
              </h1>
              <p className="text-sm text-slate-700 mt-1">{v.description}</p>
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-3 mt-4">
            <div className="bg-white/70 rounded-lg p-3">
              <div className="text-xs font-bold text-emerald-700 mb-1.5">✓ Avantages</div>
              <ul className="space-y-1 text-xs text-slate-700">
                {v.pros.map((p) => (
                  <li key={p}>• {p}</li>
                ))}
              </ul>
            </div>
            <div className="bg-white/70 rounded-lg p-3">
              <div className="text-xs font-bold text-red-700 mb-1.5">✗ Inconvénients</div>
              <ul className="space-y-1 text-xs text-slate-700">
                {v.cons.map((c) => (
                  <li key={c}>• {c}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* Demo header (mock of real header) */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm mb-6 overflow-visible">
          <div className="px-6 py-4 flex items-center gap-6">
            <div className="font-extrabold text-lg text-slate-900">📚 Examanet</div>
            <nav className="flex items-center gap-1">
              <a className="px-3 py-2 text-sm font-semibold text-slate-600">
                Ressources
              </a>
              <MenuComponent />
              <a className="px-3 py-2 text-sm font-semibold text-slate-600">
                Matières
              </a>
              <a className="px-3 py-2 text-sm font-semibold text-slate-600">
                Professeurs
              </a>
            </nav>
            <div className="ms-auto text-xs text-slate-500 bg-slate-50 px-2 py-1 rounded">
              Header mockup
            </div>
          </div>
          <div className="px-6 pb-3 text-xs text-amber-700 bg-amber-50 border-t border-amber-100">
            {hint}
          </div>
        </div>

        {/* All filter links */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-extrabold text-lg text-slate-900">
              🔗 Liens de filtres ({allLinks.length} URLs)
            </h2>
            <a
              href="https://examanet.com/fr/ressources"
              target="_blank"
              rel="noopener"
              className="text-xs text-primary-600 hover:underline flex items-center gap-1"
            >
              Page ressources prod <ExternalLink className="w-3 h-3" />
            </a>
          </div>
          <p className="text-sm text-slate-600 mb-5">
            Chaque lien ci-dessous ouvre <code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded">/fr/ressources</code> avec les filtres <code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded">?class=</code> et <code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded">?section=</code> correspondants. Teste-les pour vérifier que les filtres renvoient bien les ressources attendues.
          </p>

          {MEGA_MENU_DATA.map((cycle) => (
            <div key={cycle.slug} className="mb-6">
              <h3 className="font-bold text-sm text-slate-700 mb-3 flex items-center gap-2">
                <span className="text-xl">{cycle.emoji}</span>
                {cycle.label.fr}
              </h3>
              <div className="space-y-3">
                {cycle.niveaux.map((n) => (
                  <div key={n.slug} className="bg-slate-50 rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <span>{n.emoji}</span>
                      <strong className="text-sm text-slate-900">{n.label.fr}</strong>
                      <a
                        href={n.url}
                        target="_blank"
                        rel="noopener"
                        className="ms-auto inline-flex items-center gap-1 text-xs font-semibold text-primary-700 hover:underline"
                      >
                        {n.url} <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                    {n.sections.length > 0 ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
                        {n.sections.map((s) => (
                          <a
                            key={s.slug}
                            href={s.url}
                            target="_blank"
                            rel="noopener"
                            className="flex items-center gap-1.5 px-2 py-1.5 rounded text-xs text-slate-700 bg-white hover:bg-primary-50 hover:text-primary-700 transition border border-slate-200"
                          >
                            <span>{s.emoji}</span>
                            <span className="flex-1 truncate">{s.label.fr}</span>
                            <ExternalLink className="w-3 h-3 text-slate-400" />
                          </a>
                        ))}
                      </div>
                    ) : (
                      <div className="text-xs text-slate-500 italic">
                        Tronc commun — pas de sections
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Variant switcher */}
        <div className="mt-8 grid grid-cols-2 sm:grid-cols-5 gap-2">
          {VARIANTS.map((v) => (
            <Link
              key={v.id}
              href={`/${locale}/preview-menu/${v.id}`}
              className={`p-3 rounded-xl border text-center transition ${
                v.id === id
                  ? 'bg-primary-600 text-white border-primary-600 shadow-md'
                  : 'bg-white border-slate-200 hover:border-primary-300'
              }`}
            >
              <div className="text-xs font-bold mb-1">#{v.id}</div>
              <div className={`text-xs ${v.id === id ? 'text-white' : 'text-slate-700'}`}>
                {v.name}
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
