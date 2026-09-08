// @ts-nocheck
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth';
import { FileText, Search, Eye, Download, Star } from 'lucide-react';
import { formatNumber, timeAgo } from '@/lib/utils';
import { isArabic } from '@/lib/text-utils';
import HardDeleteResourceButton from '@/components/admin/HardDeleteResourceButton';

export const dynamic = 'force-dynamic';

async function getD1() {
  const { getCloudflareContext } = await import('@opennextjs/cloudflare');
  const ctx = await getCloudflareContext({ async: true });
  return (ctx as any).env.DB;
}

const SORT_MAP: Record<string, string> = {
  recent: 'r.createdAt DESC',
  oldest: 'r.createdAt ASC',
  views: 'r.viewsCount DESC',
  downloads: 'r.downloadsCount DESC',
  favorites: 'r.favoritesCount DESC',
  rating: 'r.avgRating DESC',
  comments: 'r.commentsCount DESC',
  title_asc: 'r.title ASC',
  title_desc: 'r.title DESC',
};

export default async function AdminResourcesPage(props: {
  searchParams: Promise<any>;
}) {
  const sp = await props.searchParams;
  const user = await getCurrentUser();
  if (!user) redirect('/connexion');
  if (user.role !== 'ADMIN') redirect('/');

  const q = sp?.q || '';
  const status = sp?.status || 'ALL';
  const sort = sp?.sort || 'recent';
  const page = parseInt(sp?.page || '1') || 1;
  const perPage = 20;

  const db = await getD1();

  // Build WHERE clause
  const where: string[] = ['1=1'];
  const params: any[] = [];
  if (q) {
    where.push('(r.title LIKE ? OR r.description LIKE ?)');
    params.push(`%${q}%`, `%${q}%`);
  }
  if (status !== 'ALL') {
    where.push('r.status = ?');
    params.push(status);
  }
  const whereSql = where.join(' AND ');
  const orderSql = SORT_MAP[sort] || SORT_MAP.recent;
  const offset = (page - 1) * perPage;

  // Total + page (run in parallel)
  const [countR, listR] = await Promise.all([
    db.prepare(`SELECT COUNT(*) as c FROM Resource r WHERE ${whereSql}`).bind(...params).first().catch(() => ({ c: 0 })),
    db.prepare(
      `SELECT r.id, r.numericId, r.slug, r.title, r.status, r.type,
              r.viewsCount, r.downloadsCount, r.favoritesCount, r.avgRating, r.commentsCount,
              r.createdAt,
              s.nameFr as subjectNameFr, s.color as subjectColor, s.icon as subjectIcon,
              c.nameFr as classNameFr,
              sec.nameFr as sectionNameFr,
              t.firstName as teacherFirstName, t.lastName as teacherLastName, t.email as teacherEmail
       FROM Resource r
       LEFT JOIN Subject s ON r.subjectId = s.id
       LEFT JOIN "Class" c ON r.classId = c.id
       LEFT JOIN Section sec ON r.sectionId = sec.id
       LEFT JOIN User t ON r.teacherId = t.id
       WHERE ${whereSql}
       ORDER BY ${orderSql}
       LIMIT ? OFFSET ?`
    ).bind(...params, perPage, offset).all().catch(() => ({ results: [] })),
  ]);

  const total = Number(countR?.c || 0);
  const totalPages = Math.ceil(total / perPage);
  const resources = listR?.results || [];

  const statusColors: Record<string, string> = {
    PUBLISHED: 'bg-emerald-100 text-emerald-700',
    PENDING_APPROVAL: 'bg-amber-100 text-amber-700',
    REJECTED: 'bg-red-100 text-red-700',
    DRAFT: 'bg-slate-100 text-slate-700',
    ARCHIVED: 'bg-slate-200 text-slate-700',
  };

  const statusLabels: Record<string, string> = {
    PUBLISHED: '✓ Publié',
    PENDING_APPROVAL: '⏳ En attente',
    REJECTED: '✕ Rejeté',
    DRAFT: '📝 Brouillon',
    ARCHIVED: '📦 Archivé',
  };

  return (
    <div>
      <h1 className="text-2xl font-extrabold mb-6">📄 Toutes les ressources</h1>

      <form className="bg-white rounded-xl p-3 border border-slate-100 flex flex-wrap gap-2 mb-4">
        <div className="flex-1 min-w-[200px] flex items-center gap-2 px-3">
          <Search className="w-4 h-4 text-slate-400 flex-shrink-0" />
          <input
            name="q"
            defaultValue={q}
            placeholder="Rechercher par titre..."
            className="flex-1 min-w-0 bg-transparent outline-none text-sm"
          />
        </div>
        <select
          name="status"
          defaultValue={status}
          className="bg-slate-50 border-0 rounded-lg px-3 py-2 text-sm outline-none flex-shrink-0"
        >
          <option value="ALL">Tous les statuts</option>
          <option value="PUBLISHED">Publiés</option>
          <option value="PENDING_APPROVAL">En attente</option>
          <option value="REJECTED">Rejetés</option>
          <option value="DRAFT">Brouillons</option>
          <option value="ARCHIVED">Archivés</option>
        </select>
        <select
          name="sort"
          defaultValue={sort}
          className="bg-slate-50 border-0 rounded-lg px-3 py-2 text-sm outline-none flex-shrink-0"
        >
          <option value="recent">📅 Plus récents</option>
          <option value="oldest">📅 Plus anciens</option>
          <option value="views">👁 Plus vus</option>
          <option value="downloads">⬇️ Plus téléchargés</option>
          <option value="favorites">❤️ Plus favoris</option>
          <option value="rating">⭐ Mieux notés</option>
          <option value="comments">💬 Plus commentés</option>
          <option value="title_asc">🔤 Titre A→Z</option>
          <option value="title_desc">🔤 Titre Z→A</option>
        </select>
        <button type="submit" className="btn-primary text-sm flex-shrink-0">
          Filtrer
        </button>
      </form>

      <div className="flex flex-wrap gap-2 mb-4">
        {['ALL', 'PUBLISHED', 'PENDING_APPROVAL', 'REJECTED'].map((s) => (
          <Link
            key={s}
            href={`/admin/ressources?status=${s}${q ? `&q=${q}` : ''}${sort !== 'recent' ? `&sort=${sort}` : ''}`}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${status === s ? 'bg-primary-500 text-white' : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-100'}`}
          >
            {s === 'ALL' ? 'Tous' : statusLabels[s] || s}
          </Link>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
        <div className="p-4 border-b border-slate-100 text-sm text-slate-500">
          {formatNumber(total)} ressource{total > 1 ? 's' : ''} trouvée{total > 1 ? 's' : ''}
        </div>
        {resources.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            <FileText className="w-12 h-12 mx-auto mb-3 text-slate-300" />
            <p>Aucune ressource trouvée</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {resources.map((r: any) => (
              <div key={r.id} className="p-4 hover:bg-slate-50 transition group">
                <div className="flex items-start gap-3">
                  <div
                    className="w-12 h-14 rounded-lg flex items-center justify-center flex-shrink-0 text-2xl"
                    style={{ background: r.subjectColor ? `${r.subjectColor}20` : '#F1F5F9' }}
                  >
                    {r.subjectIcon || '📄'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <Link
                      href={
                        r.numericId
                          ? `/ressources/${r.numericId}/${r.slug}`
                          : `/ressources/legacy-${r.id}/${r.slug}`
                      }
                      className={`font-semibold text-sm group-hover:text-primary-600 block ${isArabic(r.title) ? 'text-right' : 'text-left'}`}
                      dir={isArabic(r.title) ? 'rtl' : 'ltr'}
                      lang={isArabic(r.title) ? 'ar' : 'fr'}
                    >
                      {r.title}
                    </Link>
                    <div className="flex items-center gap-2 mt-1 text-xs text-slate-500 flex-wrap">
                      <span className="font-medium text-slate-700">{r.subjectNameFr}</span>
                      {r.classNameFr && <span>• {r.classNameFr}</span>}
                      {r.sectionNameFr && <span>• {r.sectionNameFr}</span>}
                      <span>• {timeAgo(r.createdAt)}</span>
                    </div>
                    {r.teacherFirstName && (
                      <div className="text-xs text-slate-400 mt-0.5">
                        Par{' '}
                        <span className="font-medium text-slate-600">
                          {r.teacherFirstName} {r.teacherLastName}
                        </span>
                      </div>
                    )}
                    <div className="flex items-center gap-3 mt-2 text-xs text-slate-500 flex-wrap">
                      <span className="flex items-center gap-1" title="Vues">
                        <Eye className="w-3.5 h-3.5" /> {formatNumber(r.viewsCount || 0)}
                      </span>
                      <span className="flex items-center gap-1" title="Téléchargements">
                        <Download className="w-3.5 h-3.5" /> {formatNumber(r.downloadsCount || 0)}
                      </span>
                      <span className="flex items-center gap-1" title="Note">
                        <Star className="w-3.5 h-3.5 text-amber-500" /> {(r.avgRating || 0).toFixed(1)}
                      </span>
                      <span
                        className={`px-2 py-0.5 text-xs font-bold rounded ${statusColors[r.status] || 'bg-slate-100 text-slate-700'}`}
                      >
                        {statusLabels[r.status] || r.status}
                      </span>
                      <Link
                        href={
                          r.numericId
                            ? `/ressources/${r.numericId}/${r.slug}`
                            : `/ressources/legacy-${r.id}/${r.slug}`
                        }
                        target="_blank"
                        className="ml-auto inline-flex items-center gap-1 px-2 py-1 text-xs text-slate-600 hover:text-primary-600 hover:bg-primary-50 rounded transition"
                        title="Voir la ressource"
                      >
                        <Eye className="w-3.5 h-3.5" /> Voir
                      </Link>
                      <HardDeleteResourceButton resourceId={r.id} resourceTitle={r.title} />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-1 mt-6 flex-wrap">
          {page > 1 && (
            <Link
              href={`/admin/ressources?page=${page - 1}${status !== 'ALL' ? `&status=${status}` : ''}${q ? `&q=${q}` : ''}${sort !== 'recent' ? `&sort=${sort}` : ''}`}
              className="px-3 py-1.5 rounded-lg text-sm font-semibold bg-white text-slate-600 hover:bg-slate-100 border border-slate-100 transition"
            >
              ‹ Précédent
            </Link>
          )}
          {(() => {
            const buildHref = (p: number) =>
              `/admin/ressources?page=${p}${status !== 'ALL' ? `&status=${status}` : ''}${q ? `&q=${q}` : ''}${sort !== 'recent' ? `&sort=${sort}` : ''}`;
            const pages: (number | string)[] = [];
            if (totalPages <= 7) {
              for (let i = 1; i <= totalPages; i++) pages.push(i);
            } else {
              pages.push(1);
              if (page > 4) pages.push('…');
              const start = Math.max(2, page - 1);
              const end = Math.min(totalPages - 1, page + 1);
              for (let i = start; i <= end; i++) pages.push(i);
              if (page < totalPages - 3) pages.push('…');
              pages.push(totalPages);
            }
            return pages.map((p, idx) =>
              p === '…' ? (
                <span key={`e-${idx}`} className="px-2 py-1.5 text-sm text-slate-400 select-none">…</span>
              ) : (
                <Link
                  key={p}
                  href={buildHref(Number(p))}
                  className={`min-w-[36px] text-center px-3 py-1.5 rounded-lg text-sm font-semibold transition ${page === Number(p) ? 'bg-primary-500 text-white' : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-100'}`}
                >
                  {p}
                </Link>
              ),
            );
          })()}
          {page < totalPages && (
            <Link
              href={`/admin/ressources?page=${page + 1}${status !== 'ALL' ? `&status=${status}` : ''}${q ? `&q=${q}` : ''}${sort !== 'recent' ? `&sort=${sort}` : ''}`}
              className="px-3 py-1.5 rounded-lg text-sm font-semibold bg-white text-slate-600 hover:bg-slate-100 border border-slate-100 transition"
            >
              Suivant ›
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
