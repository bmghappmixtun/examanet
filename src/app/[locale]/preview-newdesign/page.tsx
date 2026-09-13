// @ts-nocheck
// 2026-09-13: Preview helper page for the NEW DESIGN 2027.
// Visit this page to enable the cookie-based preview on the dev worker.
// Then navigate to a real resource URL — you'll see the new design.

'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';

export default function PreviewNewDesignPage() {
  const [cookieSet, setCookieSet] = useState(false);
  const [examples, setExamples] = useState<any[]>([]);

  useEffect(() => {
    // Set the cookie client-side
    document.cookie = 'preview_newdesign=1; path=/; max-age=' + (60*60*24*30) + '; SameSite=Lax';
    setCookieSet(true);
    
    // Fetch some example resources
    fetch('/api/resources/preview-examples')
      .then(r => r.json())
      .then(d => setExamples(d.examples || []))
      .catch(() => setExamples([]));
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-violet-50 to-sky-50">
      <div className="max-w-4xl mx-auto px-4 py-12">
        <div className="bg-white border-2 border-violet-200 rounded-2xl p-8 shadow-xl">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-white text-2xl">✨</div>
            <div>
              <div className="text-[11px] uppercase tracking-wider font-bold text-violet-700">Preview enabled</div>
              <h1 className="text-3xl font-extrabold text-slate-900">NEW DESIGN 2027</h1>
            </div>
          </div>
          
          <p className="text-slate-600 mb-6">
            Le cookie <code className="bg-slate-100 px-1.5 py-0.5 rounded text-sm">preview_newdesign=1</code> a été activé sur ce navigateur.
            Toutes les pages ressources s'afficheront maintenant avec le nouveau design.
          </p>

          {cookieSet && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 mb-6">
              <div className="text-emerald-800 text-sm font-medium">✅ Cookie activé</div>
              <div className="text-emerald-700 text-xs mt-1">Le nouveau design sera visible sur toutes les fiches ressources pendant 30 jours.</div>
            </div>
          )}

          <h2 className="text-lg font-bold text-slate-900 mb-3">Cliquez sur une fiche pour tester :</h2>
          
          <div className="grid sm:grid-cols-2 gap-3">
            <Link href="/fr/ressources/2369/" className="block bg-slate-50 hover:bg-violet-50 border border-slate-200 hover:border-violet-300 rounded-xl p-4 transition">
              <div className="text-sm font-bold text-slate-900 mb-1">#2369 — Math 9ème (AR)</div>
              <div className="text-xs text-slate-500">فرض مراقبة عدد 3 - top vue</div>
            </Link>
            <Link href="/fr/ressources/12173/" className="block bg-slate-50 hover:bg-violet-50 border border-slate-200 hover:border-violet-300 rounded-xl p-4 transition">
              <div className="text-sm font-bold text-slate-900 mb-1">#12173 — Math Bac (FR)</div>
              <div className="text-xs text-slate-500">Analyse des fonctions — top 2</div>
            </Link>
            <Link href="/fr/ressources/454/" className="block bg-slate-50 hover:bg-violet-50 border border-slate-200 hover:border-violet-300 rounded-xl p-4 transition">
              <div className="text-sm font-bold text-slate-900 mb-1">#454 — Phyto Bac</div>
              <div className="text-xs text-slate-500">Sujets Bac Sciences</div>
            </Link>
            <Link href="/fr/ressources/14493/" className="block bg-slate-50 hover:bg-violet-50 border border-slate-200 hover:border-violet-300 rounded-xl p-4 transition">
              <div className="text-sm font-bold text-slate-900 mb-1">#14493 — Physique 3AS</div>
              <div className="text-xs text-slate-500">Avec tags (Related by tags visible)</div>
            </Link>
          </div>

          <div className="mt-6 pt-6 border-t border-slate-200">
            <div className="text-xs text-slate-500">
              <strong>Pour désactiver :</strong> ouvre DevTools → Console → <code className="bg-slate-100 px-1 rounded">document.cookie='preview_newdesign=; path=/; max-age=0'</code>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
