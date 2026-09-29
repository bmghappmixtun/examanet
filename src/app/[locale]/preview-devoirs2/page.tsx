// @ts-nocheck
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { Link } from '@/i18n/navigation';
import { ChevronRight, Sparkles } from 'lucide-react';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Preview Devoirs v2 — Apex Design',
  robots: { index: false, follow: false },
};

export default async function PreviewDevoirs2Index() {
  const ctx = await getCloudflareContext({ async: true });
  const db = (ctx as any).env?.DB;

  let subjects: any[] = [];
  if (db) {
    const r = await db
      .prepare(
        `SELECT s.slug, s.nameFr, s.nameAr, s.color,
          (SELECT COUNT(*) FROM Resource r WHERE r.subjectId = s.id AND r.type = 'DEVOIR' AND r.status = 'PUBLISHED') as count
         FROM Subject s ORDER BY s."order" ASC`,
      )
      .all();
    subjects = (r.results || []).slice(0, 10);
  }

  return (
    <div className="min-h-screen bg-slate-50 pt-24 pb-12">
      <div className="max-w-4xl mx-auto px-4">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-violet-100 text-violet-700 text-sm font-bold mb-4">
          <Sparkles size={14} />
          Apex Design Preview v2
        </div>
        <h1 className="text-4xl font-extrabold mb-3">Devoirs — New Design</h1>
        <p className="text-slate-600 mb-8">
          Choose a subject to preview the new apex design (aurora hero, bento grid, sticky filter bar, FAQ schema).
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {subjects.map((s) => (
            <Link
              key={s.slug}
              href={`/preview-devoirs2/${s.slug}`}
              className="p-4 bg-white rounded-xl border border-slate-200 hover:border-primary-400 hover:shadow-md transition group"
            >
              <div className="font-bold text-slate-900 group-hover:text-primary-600">{s.nameFr}</div>
              <div className="text-xs text-slate-500 mt-1">{s.count} devoirs</div>
              <ChevronRight size={14} className="absolute opacity-0 group-hover:opacity-100 right-3 top-3 transition" />
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
