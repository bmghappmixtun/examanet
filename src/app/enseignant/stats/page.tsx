// @ts-nocheck
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth';
import {
  Eye,
  Download,
  Star,
  TrendingUp,
  FileText,
  Upload,
  BarChart3,
  ArrowLeft,
} from 'lucide-react';
import { formatNumber, timeAgo } from '@/lib/utils';

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

export default async function TeacherStatsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/connexion');

  const db = await getD1();
  const teacher = await db.prepare('SELECT status FROM User WHERE id = ?').bind(user.id).first().catch(() => null);
  const canUpload = teacher?.status === 'ACTIVE';

  // Top performing resources + all published
  const [topR, allPubR, totalsR, monthlyR] = await Promise.all([
    db.prepare(
      `SELECT r.id, r.numericId, r.slug, r.title, r.type, r.status,
              r.viewsCount, r.downloadsCount, r.avgRating, r.favoritesCount, r.commentsCount,
              r.createdAt, r.publishedAt,
              s.nameFr as subjectNameFr, s.color as subjectColor, s.icon as subjectIcon,
              c.nameFr as classNameFr
       FROM Resource r
       LEFT JOIN Subject s ON r.subjectId = s.id
       LEFT JOIN "Class" c ON r.classId = c.id
       WHERE r.teacherId = ? AND r.status = 'PUBLISHED'
       ORDER BY r.viewsCount DESC
       LIMIT 10`,
    ).bind(user.id).all().catch(() => ({ results: [] })),
    db.prepare(
      "SELECT viewsCount, downloadsCount, avgRating FROM Resource WHERE teacherId = ? AND status = 'PUBLISHED'",
    ).bind(user.id).all().catch(() => ({ results: [] })),
    db.prepare(
      `SELECT
         (SELECT COUNT(*) FROM Resource WHERE teacherId = ?) AS total,
         (SELECT COUNT(*) FROM Resource WHERE teacherId = ? AND status = 'PUBLISHED') AS published,
         (SELECT COUNT(*) FROM Resource WHERE teacherId = ? AND status = 'PENDING_APPROVAL') AS pending,
         (SELECT COUNT(*) FROM Resource WHERE teacherId = ? AND status = 'REJECTED') AS rejected`,
    ).bind(user.id, user.id, user.id, user.id).first().catch(() => ({ total: 0, published: 0, pending: 0, rejected: 0 })),
    // Monthly aggregation: 12 months back
    db.prepare(
      `SELECT
         strftime('%Y-%m', datetime(createdAt/1000, 'unixepoch')) AS month,
         COUNT(*) AS count,
         SUM(viewsCount) AS views,
         SUM(downloadsCount) AS downloads
       FROM Resource
       WHERE teacherId = ? AND status = 'PUBLISHED' AND createdAt > ?
       GROUP BY month
       ORDER BY month ASC`,
    ).bind(user.id, Date.now() - 365 * 24 * 60 * 60 * 1000).all().catch(() => ({ results: [] })),
  ]);

  const top = topR?.results || [];
  const allPub = allPubR?.results || [];
  const monthly = monthlyR?.results || [];
  const totalR_t = totalsR || {};

  let totalViews = 0;
  let totalDownloads = 0;
  let ratingSum = 0;
  for (const r of allPub) {
    totalViews += num(r.viewsCount);
    totalDownloads += num(r.downloadsCount);
    ratingSum += Number(r.avgRating) || 0;
  }
  const avgRating = allPub.length ? ratingSum / allPub.length : 0;
  const total = num(totalR_t.total);
  const published = num(totalR_t.published);
  const pending = num(totalR_t.pending);
  const rejected = num(totalR_t.rejected);

  // Engagement rate
  const engagementRate = totalViews > 0 ? (totalDownloads / totalViews) * 100 : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900">Statistiques & Analytics 📊</h1>
          <p className="text-slate-500 text-sm mt-1">Performance de vos ressources</p>
        </div>
        {canUpload && (
          <Link href="/enseignant/ajouter" className="btn-primary inline-flex items-center gap-2">
            <Upload className="w-4 h-4" /> Nouvelle ressource
          </Link>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-5 border border-slate-100">
          <FileText className="w-5 h-5 text-blue-500 mb-2" />
          <div className="text-2xl font-extrabold">{formatNumber(total)}</div>
          <div className="text-sm text-slate-600">Total ressources</div>
          <div className="text-xs text-slate-400 mt-0.5">{published} publiées</div>
        </div>
        <div className="bg-white rounded-xl p-5 border border-slate-100">
          <Eye className="w-5 h-5 text-emerald-500 mb-2" />
          <div className="text-2xl font-extrabold">{formatNumber(totalViews)}</div>
          <div className="text-sm text-slate-600">Vues totales</div>
        </div>
        <div className="bg-white rounded-xl p-5 border border-slate-100">
          <Download className="w-5 h-5 text-amber-500 mb-2" />
          <div className="text-2xl font-extrabold">{formatNumber(totalDownloads)}</div>
          <div className="text-sm text-slate-600">Téléchargements</div>
        </div>
        <div className="bg-white rounded-xl p-5 border border-slate-100">
          <Star className="w-5 h-5 text-purple-500 mb-2" />
          <div className="text-2xl font-extrabold">{avgRating.toFixed(1)}</div>
          <div className="text-sm text-slate-600">Note moyenne</div>
          <div className="text-xs text-slate-400 mt-0.5">sur {allPub.length} ressources</div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
          <div className="text-xs font-bold text-emerald-700 uppercase">Publiées</div>
          <div className="text-2xl font-extrabold text-emerald-700 mt-1">{formatNumber(published)}</div>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <div className="text-xs font-bold text-amber-700 uppercase">En attente</div>
          <div className="text-2xl font-extrabold text-amber-700 mt-1">{formatNumber(pending)}</div>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <div className="text-xs font-bold text-red-700 uppercase">Refusées</div>
          <div className="text-2xl font-extrabold text-red-700 mt-1">{formatNumber(rejected)}</div>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <div className="text-xs font-bold text-blue-700 uppercase">Taux engagement</div>
          <div className="text-2xl font-extrabold text-blue-700 mt-1">{engagementRate.toFixed(1)}%</div>
          <div className="text-xs text-blue-600 mt-0.5">downloads / vues</div>
        </div>
      </div>

      {monthly.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-100 p-6">
          <h2 className="font-bold text-lg mb-4 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-slate-400" />
            Activité sur 12 mois
          </h2>
          <div className="space-y-2">
            {monthly.map((m: any) => {
              const maxViews = Math.max(...monthly.map((x: any) => num(x.views)), 1);
              const widthPct = (num(m.views) / maxViews) * 100;
              return (
                <div key={m.month} className="flex items-center gap-3 text-sm">
                  <span className="w-20 text-slate-600 font-mono text-xs">{m.month}</span>
                  <div className="flex-1 bg-slate-100 rounded-full h-6 relative overflow-hidden">
                    <div className="bg-emerald-500 h-6 rounded-full" style={{ width: `${widthPct}%` }} />
                  </div>
                  <span className="w-24 text-right text-slate-700 font-semibold">
                    {formatNumber(num(m.views))} vues
                  </span>
                  <span className="w-32 text-right text-slate-500 text-xs">
                    {m.count} ress. · {formatNumber(num(m.downloads))} DL
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-100 p-6">
        <h2 className="font-bold text-lg mb-4 flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-emerald-500" />
          Top 10 ressources par vues
        </h2>
        {top.length === 0 ? (
          <div className="text-center py-8 text-slate-500">
            <p>Pas encore de ressources publiées.</p>
            {canUpload && (
              <Link href="/enseignant/ajouter" className="btn-primary mt-3 inline-flex">
                Publier ma première ressource
              </Link>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {top.map((r: any, i: number) => (
              <Link
                key={r.id}
                href={r.numericId ? `/ressources/${r.numericId}/${r.slug}` : '#'}
                target="_blank"
                className="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 transition group"
              >
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-400 to-emerald-600 text-white font-bold text-sm flex items-center justify-center flex-shrink-0">
                  {i + 1}
                </div>
                <div
                  className="w-10 h-12 rounded-lg flex items-center justify-center flex-shrink-0 text-xl"
                  style={{ background: r.subjectColor ? `${r.subjectColor}20` : '#F1F5F9' }}
                >
                  {r.subjectIcon || '📄'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm truncate group-hover:text-primary-600">{r.title}</div>
                  <div className="text-xs text-slate-500">{r.subjectNameFr} · {timeAgo(r.publishedAt || r.createdAt)}</div>
                </div>
                <div className="flex items-center gap-3 text-xs text-slate-500 flex-shrink-0">
                  <span className="flex items-center gap-1"><Eye className="w-3.5 h-3.5" />{formatNumber(r.viewsCount)}</span>
                  <span className="flex items-center gap-1"><Download className="w-3.5 h-3.5" />{formatNumber(r.downloadsCount)}</span>
                  <span className="flex items-center gap-1"><Star className="w-3.5 h-3.5 text-amber-500" />{(r.avgRating || 0).toFixed(1)}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
