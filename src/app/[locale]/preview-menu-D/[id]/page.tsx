// @ts-nocheck
import { Link } from '@/i18n/navigation';
import { ChevronLeft, ExternalLink } from 'lucide-react';
import MenuMatieresTypeFirst from '@/components/mega-menu/MenuMatieresTypeFirst';

export const dynamic = 'force-dynamic';
export const metadata = { robots: { index: false, follow: false } };

const SAMPLE_IDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

export default async function PreviewMenuDPage({
  params,
}: {
  params: Promise<{ id: string; locale: string }>;
}) {
  const { id: idStr, locale } = await params;
  const id = parseInt(idStr, 10);
  if (isNaN(id) || id < 1 || id > 10) {
    return (
      <div className="min-h-screen bg-slate-50 pt-24 pb-12 px-4 text-center">
        <p className="text-slate-600">ID invalide (1-10)</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pt-24 pb-12">
      <div className="max-w-6xl mx-auto px-4">
        <div className="mb-6 flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            {id > 1 && (
              <Link
                href={`/${locale}/preview-menu-D/${id - 1}`}
                className="inline-flex items-center gap-1 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-sm font-semibold hover:bg-slate-50 transition"
              >
                <ChevronLeft className="w-4 h-4" /> Précédent
              </Link>
            )}
            <Link
              href={`/${locale}/preview-menu`}
              className="inline-flex items-center gap-1 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-sm font-semibold hover:bg-slate-50 transition"
            >
              📋 Menu actuel (#6)
            </Link>
            <Link
              href={`/${locale}/preview-menu-E/1`}
              className="inline-flex items-center gap-1 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-sm font-semibold hover:bg-slate-50 transition"
            >
              🆕 Proposition E (Dropdown Cards) →
            </Link>
          </div>
          <div className="text-sm text-slate-600">
            Proposition <strong className="text-slate-900">D</strong> ·{' '}
            <span className="font-semibold">Type-First</span>
          </div>
        </div>

        <div className="bg-gradient-to-br from-blue-50 to-violet-50 rounded-2xl p-5 mb-6 border border-blue-100">
          <div className="flex items-start gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-white border border-blue-200 flex items-center justify-center text-xl">
              🎯
            </div>
            <div>
              <h1 className="font-extrabold text-xl text-slate-900">
                Proposition D — Type-First Navigation
              </h1>
              <p className="text-sm text-slate-700 mt-1">
                L'utilisateur dit d'abord ce qu'il cherche (Devoirs | Cours | Séries), puis
                navigue dans les matières. Épuré : 3 gros tabs au lieu de 84 liens.
              </p>
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-3 mt-4">
            <div className="bg-white/70 rounded-lg p-3">
              <div className="text-xs font-bold text-emerald-700 mb-1.5">✓ Avantages</div>
              <ul className="space-y-1 text-xs text-slate-700">
                <li>• Très épuré : 3 tabs + grille 28 cartes</li>
                <li>• L'utilisateur commence par l'intention</li>
                <li>• 1 seul lien par matière</li>
                <li>• Visuellement plus calme</li>
              </ul>
            </div>
            <div className="bg-white/70 rounded-lg p-3">
              <div className="text-xs font-bold text-red-700 mb-1.5">✗ Inconvénients</div>
              <ul className="space-y-1 text-xs text-slate-700">
                <li>• 1 clic de plus pour changer de type</li>
                <li>• Le type n'est pas le bon critère pour tous</li>
                <li>• Pas de vue "tous les types en même temps"</li>
              </ul>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm mb-6 overflow-visible">
          <div className="px-6 py-4 flex items-center gap-6">
            <div className="font-extrabold text-lg text-slate-900">📚 Examanet</div>
            <nav className="flex items-center gap-1">
              <a className="px-3 py-2 text-sm font-semibold text-slate-600">Ressources</a>
              <MenuMatieresTypeFirst />
              <a className="px-3 py-2 text-sm font-semibold text-slate-600">Matières</a>
              <a className="px-3 py-2 text-sm font-semibold text-slate-600">Professeurs</a>
            </nav>
            <div className="ms-auto text-xs text-slate-500 bg-slate-50 px-2 py-1 rounded">
              Header mockup
            </div>
          </div>
          <div className="px-6 pb-3 text-xs text-amber-700 bg-amber-50 border-t border-amber-100">
            💡 Clique sur "Matières" pour ouvrir le modal Type-First
          </div>
        </div>

        <div className="mt-8 grid grid-cols-5 sm:grid-cols-10 gap-2">
          {SAMPLE_IDS.map((n) => (
            <Link
              key={n}
              href={`/${locale}/preview-menu-D/${n}`}
              className={`p-2 rounded-lg border text-center transition text-xs ${
                n === id ? 'bg-blue-600 text-white border-blue-600' : 'bg-white border-slate-200 hover:border-blue-300'
              }`}
            >
              #{n}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
