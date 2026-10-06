// @ts-nocheck
import { Link } from '@/i18n/navigation';
import { ChevronLeft } from 'lucide-react';
import MenuMatieresCollegeLycee from '@/components/mega-menu/MenuMatieresCollegeLycee';

export const dynamic = 'force-dynamic';
export const metadata = { robots: { index: false, follow: false } };

const SAMPLE_IDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

export default async function PreviewMenuGPage({
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
                href={`/${locale}/preview-menu-G/${id - 1}`}
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
              href={`/${locale}/preview-menu-D/1`}
              className="inline-flex items-center gap-1 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-sm font-semibold hover:bg-slate-50 transition"
            >
              ← Proposition D (Type-First)
            </Link>
            <Link
              href={`/${locale}/preview-menu-E/1`}
              className="inline-flex items-center gap-1 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-sm font-semibold hover:bg-slate-50 transition"
            >
              ← Proposition E (Dropdown Cards)
            </Link>
          </div>
          <div className="text-sm text-slate-600">
            Proposition <strong className="text-slate-900">G</strong> ·{' '}
            <span className="font-semibold">Collège / Lycée</span>
          </div>
        </div>

        <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-2xl p-5 mb-6 border border-purple-100">
          <div className="flex items-start gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-white border border-purple-200 flex items-center justify-center text-xl">
              🏫
            </div>
            <div>
              <h1 className="font-extrabold text-xl text-slate-900">
                Proposition G — Collège / Lycée (2 onglets cycle)
              </h1>
              <p className="text-sm text-slate-700 mt-1">
                Onglets par <strong>cycle</strong> (Collège 7-9 / Lycée 1-4AS). Chaque onglet
                affiche les matières pertinentes à ce cycle. Les matières communes
                (Maths, Français, etc.) sont filtrées intelligemment.
              </p>
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-3 mt-4">
            <div className="bg-white/70 rounded-lg p-3">
              <div className="text-xs font-bold text-emerald-700 mb-1.5">✓ Avantages</div>
              <ul className="space-y-1 text-xs text-slate-700">
                <li>• Navigation par cycle = mental modèle clair</li>
                <li>• Collège : tronc commun (7ème → 9ème)</li>
                <li>• Lycée : tronc commun + sections (1AS → 4AS)</li>
                <li>• Filtre les matières spécifiques (ex: Philosophie = lycée only)</li>
              </ul>
            </div>
            <div className="bg-white/70 rounded-lg p-3">
              <div className="text-xs font-bold text-red-700 mb-1.5">✗ Inconvénients</div>
              <ul className="space-y-1 text-xs text-slate-700">
                <li>• Matières "communes" apparaissent dans les 2 onglets</li>
                <li>• Risque de confusion "où est ma matière ?"</li>
                <li>• Si tu sais pas ton cycle, faut cliquer les 2</li>
              </ul>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm mb-6 overflow-visible">
          <div className="px-6 py-4 flex items-center gap-6">
            <div className="font-extrabold text-lg text-slate-900">📚 Examanet</div>
            <nav className="flex items-center gap-1">
              <a className="px-3 py-2 text-sm font-semibold text-slate-600">Ressources</a>
              <MenuMatieresCollegeLycee />
              <a className="px-3 py-2 text-sm font-semibold text-slate-600">Matières</a>
              <a className="px-3 py-2 text-sm font-semibold text-slate-600">Professeurs</a>
            </nav>
            <div className="ms-auto text-xs text-slate-500 bg-slate-50 px-2 py-1 rounded">
              Header mockup
            </div>
          </div>
          <div className="px-6 pb-3 text-xs text-amber-700 bg-amber-50 border-t border-amber-100">
            💡 Clique sur "Matières" — les onglets Collège/Lycée filtrent les matières par cycle
          </div>
        </div>

        <div className="mt-8 grid grid-cols-5 sm:grid-cols-10 gap-2">
          {SAMPLE_IDS.map((n) => (
            <Link
              key={n}
              href={`/${locale}/preview-menu-G/${n}`}
              className={`p-2 rounded-lg border text-center transition text-xs ${
                n === id ? 'bg-purple-600 text-white border-purple-600' : 'bg-white border-slate-200 hover:border-purple-300'
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
