// @ts-nocheck
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth';
import {
  FileText,
  Eye,
  Download,
  Edit,
  CheckCircle,
  Clock,
  XCircle,
  Plus,
  AlertCircle,
  RefreshCw,
  Filter,
} from 'lucide-react';
import { formatNumber, timeAgo } from '@/lib/utils';
import { isArabic } from '@/lib/text-utils';
import DeleteResourceButton from '@/components/teacher/DeleteResourceButton';

export const dynamic = 'force-dynamic';

async function getD1() {
  const { getCloudflareContext } = await import('@opennextjs/cloudflare');
  const ctx = await getCloudflareContext({ async: true });
  return (ctx as any).env.DB;
}

function num(v: any): number {
  if (v == null) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

const SORT_MAP: Record<string, string> = {
  recent: 'r.updatedAt DESC',
  oldest: 'r.updatedAt ASC',
  views: 'r.viewsCount DESC',
  downloads: 'r.downloadsCount DESC',
  rating: 'r.avgRating DESC',
  title: 'r.title ASC',
};

export default async function TeacherResourcesPage(props: {
  searchParams: Promise<any>;
}) {
  const sp = await props.searchParams;
  const user = await getCurrentUser();
  if (!user) redirect('/connexion');

  const status = sp?.status || 'ALL';
  const editStatus = sp?.editStatus || 'ALL';
  const sort = sp?.sort || 'recent';
  const page = Math.max(1, parseInt(sp?.page || '1'));
  const limit = 20;

  const db = await getD1();

  // Teacher status
  const teacher = await db
    .prepare('SELECT status FROM User WHERE id = ?')
    .bind(user.id)
    .first()
    .catch(() => null);
  const canUpload = teacher?.status === 'ACTIVE';

  // WHERE
  const conds = ['r.teacherId = ?'];
  const params: any[] = [user.id];
  if (status !== 'ALL') {
    conds.push('r.status = ?');
    params.push(status);
  }
  if (editStatus !== 'ALL') {
    // D1 Resource has no editStatus column — ignore this filter for now
    conds.push('1=1');
  }
  const whereSql = conds.join(' AND ');
  const orderSql = SORT_MAP[sort] || SORT_MAP.recent;
  const offset = (page - 1) * limit;

  // Paginated list + count + subjects + stats
  const [resourcesR, countR, subjectsR, publishedR, pendingR, rejectedR, pendingEditR, editRejectedR] =
    await Promise.all([
      db.prepare(
        `SELECT r.id, r.numericId, r.slug, r.title, r.status, r.type,
                r.viewsCount, r.downloadsCount, r.avgRating, r.createdAt, r.updatedAt,
                s.nameFr as subjectNameFr, s.color as subjectColor, s.icon as subjectIcon,
                c.nameFr as classNameFr,
                sec.nameFr as sectionNameFr
         FROM Resource r
         LEFT JOIN Subject s ON r.subjectId = s.id
         LEFT JOIN "Class" c ON r.classId = c.id
         LEFT JOIN Section sec ON r.sectionId = sec.id
         WHERE ${whereSql}
         ORDER BY ${orderSql}
         LIMIT ? OFFSET ?`,
      ).bind(...params, limit, offset).all().catch(() => ({ results: [] })),
      db.prepare(`SELECT COUNT(*) as c FROM Resource r WHERE ${whereSql}`).bind(...params).first().catch(() => ({ c: 0 })),
      db.prepare('SELECT id, nameFr, icon FROM Subject ORDER BY nameFr ASC').all().catch(() => ({ results: [] })),
      db.prepare("SELECT COUNT(*) as c FROM Resource WHERE teacherId = ? AND status = 'PUBLISHED'").bind(user.id).first().catch(() => ({ c: 0 })),
      db.prepare("SELECT COUNT(*) as c FROM Resource WHERE teacherId = ? AND status = 'PENDING_APPROVAL'").bind(user.id).first().catch(() => ({ c: 0 })),
      db.prepare("SELECT COUNT(*) as c FROM Resource WHERE teacherId = ? AND status = 'REJECTED'").bind(user.id).first().catch(() => ({ c: 0 })),
      db.prepare("SELECT COUNT(*) as c FROM Resource WHERE teacherId = ? AND editStatus = 'PENDING_EDIT_APPROVAL'").bind(user.id).first().catch(() => ({ c: 0 })),
      db.prepare("SELECT COUNT(*) as c FROM Resource WHERE teacherId = ? AND editStatus = 'EDIT_REJECTED'").bind(user.id).first().catch(() => ({ c: 0 })),
    ]);

  const resources = resourcesR?.results || [];
  const total = num(countR?.c);
  const subjects = subjectsR?.results || [];
  const totalPages = Math.ceil(total / limit);
  const published = num(publishedR?.c);
  const pendingApproval = num(pendingR?.c);
  const rejected = num(rejectedR?.c);
  const pendingEdit = num(pendingEditR?.c);
  const editRejected = num(editRejectedR?.c);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900">Mes ressources 📚</h1>
          <p className="text-slate-500 text-sm mt-1">
            {formatNumber(total)} ressource{total > 1 ? 's' : ''} au total
          </p>
        </div>
        {canUpload ? (
          <Link href="/enseignant/ajouter" className="btn-primary inline-flex items-center gap-2">
            <Plus className="w-4 h-4" /> Nouvelle ressource
          </Link>
        ) : (
          <span className="inline-flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-500 font-semibold rounded-xl cursor-not-allowed">
            <Plus className="w-4 h-4" /> Nouvelle ressource
            <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-bold">🔒</span>
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: 'Publiées', value: published, dot: 'bg-emerald-500', href: '/enseignant/ressources?status=PUBLISHED', active: status === 'PUBLISHED' },
          { label: 'En attente', value: pendingApproval, dot: 'bg-amber-500', href: '/enseignant/ressources?status=PENDING_APPROVAL', active: status === 'PENDING_APPROVAL' },
          { label: 'Refusées', value: rejected, dot: 'bg-red-500', href: '/enseignant/ressources?status=REJECTED', active: status === 'REJECTED' },
          { label: 'Modifs en attente', value: pendingEdit, dot: 'bg-blue-500', href: '/enseignant/ressources?editStatus=PENDING_EDIT_APPROVAL', active: editStatus === 'PENDING_EDIT_APPROVAL' },
          { label: 'Modifs refusées', value: editRejected, dot: 'bg-orange-500', href: '/enseignant/ressources?editStatus=EDIT_REJECTED', active: editStatus === 'EDIT_REJECTED' },
        ].map((s, i) => (
          <Link
            key={i}
            href={s.href}
            className={`bg-white rounded-xl p-3 border-2 transition ${
              s.active ? 'border-slate-900' : 'border-slate-100 hover:border-slate-200'
            }`}
          >
            <div className="flex items-center gap-2 mb-1">
              <div className={`w-2 h-2 rounded-full ${s.dot}`} />
              <span className="text-xs font-semibold text-slate-600">{s.label}</span>
            </div>
            <div className="text-2xl font-extrabold">{formatNumber(s.value)}</div>
          </Link>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-3 flex items-center gap-2 overflow-x-auto">
        <Filter className="w-4 h-4 text-slate-400 ml-2 flex-shrink-0" />
        <Link
          href="/enseignant/ressources"
          className={`px-3 py-1.5 rounded-lg text-sm font-semibold whitespace-nowrap ${
            status === 'ALL' && editStatus === 'ALL' ? 'bg-slate-900 text-white' : 'hover:bg-slate-100 text-slate-600'
          }`}
        >
          Toutes
        </Link>
        <span className="text-slate-300">|</span>
        <Link
          href="/enseignant/ressources?status=PUBLISHED"
          className={`px-3 py-1.5 rounded-lg text-sm font-semibold whitespace-nowrap ${
            status === 'PUBLISHED' ? 'bg-emerald-500 text-white' : 'hover:bg-slate-100 text-slate-600'
          }`}
        >
          Publiées
        </Link>
        <Link
          href="/enseignant/ressources?status=PENDING_APPROVAL"
          className={`px-3 py-1.5 rounded-lg text-sm font-semibold whitespace-nowrap ${
            status === 'PENDING_APPROVAL' ? 'bg-amber-500 text-white' : 'hover:bg-slate-100 text-slate-600'
          }`}
        >
          En attente
        </Link>
        <Link
          href="/enseignant/ressources?status=REJECTED"
          className={`px-3 py-1.5 rounded-lg text-sm font-semibold whitespace-nowrap ${
            status === 'REJECTED' ? 'bg-red-500 text-white' : 'hover:bg-slate-100 text-slate-600'
          }`}
        >
          Refusées
        </Link>
        <Link
          href="/enseignant/ressources?status=DRAFT"
          className={`px-3 py-1.5 rounded-lg text-sm font-semibold whitespace-nowrap ${
            status === 'DRAFT' ? 'bg-slate-500 text-white' : 'hover:bg-slate-100 text-slate-600'
          }`}
        >
          Brouillons
        </Link>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        {resources.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            <FileText className="w-12 h-12 mx-auto mb-3 text-slate-300" />
            <p>Aucune ressource</p>
            {canUpload && (
              <Link href="/enseignant/ajouter" className="btn-primary mt-3 inline-flex">
                Publier ma première ressource
              </Link>
            )}
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {resources.map((r: any) => (
              <div key={r.id} className="p-4 hover:bg-slate-50 transition">
                <div className="flex items-start gap-3">
                  <div
                    className="w-12 h-14 rounded-lg flex items-center justify-center flex-shrink-0 text-2xl"
                    style={{ background: r.subjectColor ? `${r.subjectColor}20` : '#F1F5F9' }}
                  >
                    {r.subjectIcon || '📄'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div
                      className={`font-semibold text-sm ${isArabic(r.title) ? 'text-right' : 'text-left'}`}
                      dir={isArabic(r.title) ? 'rtl' : 'ltr'}
                      lang={isArabic(r.title) ? 'ar' : 'fr'}
                    >
                      {r.title}
                    </div>
                    <div className="flex items-center gap-2 mt-1 text-xs text-slate-500 flex-wrap">
                      <span className="font-medium text-slate-700">{r.subjectNameFr}</span>
                      {r.classNameFr && <span>• {r.classNameFr}</span>}
                      {r.sectionNameFr && <span>• {r.sectionNameFr}</span>}
                      <span>• {timeAgo(r.createdAt)}</span>
                    </div>
                    <div className="flex items-center gap-3 mt-2 text-xs text-slate-500 flex-wrap">
                      <span className="flex items-center gap-1">
                        <Eye className="w-3.5 h-3.5" /> {formatNumber(r.viewsCount || 0)}
                      </span>
                      <span className="flex items-center gap-1">
                        <Download className="w-3.5 h-3.5" /> {formatNumber(r.downloadsCount || 0)}
                      </span>
                      <span className="flex items-center gap-1">
                        ⭐ {(r.avgRating || 0).toFixed(1)}
                      </span>
                      <span className={`px-2 py-0.5 text-xs font-bold rounded ${
                        r.status === 'PUBLISHED' ? 'bg-emerald-100 text-emerald-700' :
                        r.status === 'PENDING_APPROVAL' ? 'bg-amber-100 text-amber-700' :
                        r.status === 'REJECTED' ? 'bg-red-100 text-red-700' :
                        'bg-slate-100 text-slate-700'
                      }`}>
                        {r.status === 'PUBLISHED' ? '✓ Publié' :
                         r.status === 'PENDING_APPROVAL' ? '⏳ En attente' :
                         r.status === 'REJECTED' ? '✕ Refusé' :
                         r.status === 'DRAFT' ? '📝 Brouillon' : r.status}
                      </span>
                      {r.editStatus && r.editStatus !== 'NONE' && (
                        <span className="px-2 py-0.5 text-xs font-bold rounded bg-blue-100 text-blue-700">
                          ✏️ Modif {r.editStatus === 'PENDING_EDIT_APPROVAL' ? 'en attente' : 'refusée'}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {r.numericId && (
                      <Link
                        href={`/ressources/${r.numericId}/${r.slug}`}
                        target="_blank"
                        className="p-2 text-slate-400 hover:text-primary-600 hover:bg-primary-50 rounded transition"
                        title="Voir"
                      >
                        <Eye className="w-4 h-4" />
                      </Link>
                    )}
                    {r.status === 'DRAFT' && (
                      <Link
                        href={`/enseignant/ajouter?edit=${r.id}`}
                        className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded transition"
                        title="Continuer l'édition"
                      >
                        <Edit className="w-4 h-4" />
                      </Link>
                    )}
                    <DeleteResourceButton id={r.id} title={r.title} />
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
              href={`/enseignant/ressources?page=${page - 1}${status !== 'ALL' ? `&status=${status}` : ''}${editStatus !== 'ALL' ? `&editStatus=${editStatus}` : ''}${sort !== 'recent' ? `&sort=${sort}` : ''}`}
              className="px-3 py-1.5 rounded-lg text-sm font-semibold bg-white text-slate-600 hover:bg-slate-100 border border-slate-100 transition"
            >
              ‹ Précédent
            </Link>
          )}
          {Array.from({ length: Math.min(7, totalPages) }, (_, i) => i + 1).map((p) => (
            <Link
              key={p}
              href={`/enseignant/ressources?page=${p}${status !== 'ALL' ? `&status=${status}` : ''}${editStatus !== 'ALL' ? `&editStatus=${editStatus}` : ''}${sort !== 'recent' ? `&sort=${sort}` : ''}`}
              className={`min-w-[36px] text-center px-3 py-1.5 rounded-lg text-sm font-semibold transition ${
                page === p ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-100'
              }`}
            >
              {p}
            </Link>
          ))}
          {page < totalPages && (
            <Link
              href={`/enseignant/ressources?page=${page + 1}${status !== 'ALL' ? `&status=${status}` : ''}${editStatus !== 'ALL' ? `&editStatus=${editStatus}` : ''}${sort !== 'recent' ? `&sort=${sort}` : ''}`}
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
